import "server-only";

import type {
  CollectionsResponse,
  SearchHit,
  SearchMode,
  StatusResponse,
} from "@/lib/search-types";

interface KnowledgeConfig {
  url: string;
  apiKey: string;
  accessUrl: string;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

export interface SearchRequest {
  query: string;
  collections: string[];
  topK: number;
  mode: SearchMode;
}

interface KnowledgeSearchResponse {
  hits: SearchHit[];
  mode: SearchMode;
  reranked: boolean;
  expanded: string[];
  embedding?: { provider: string };
}

export class KnowledgeError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number = 502,
  ) {
    super(code);
    this.name = "KnowledgeError";
  }
}

const REQUEST_TIMEOUT_MS = 10_000;
const TOKEN_REFRESH_MARGIN_MS = 30_000;
let cachedToken: CachedToken | undefined;
let pendingExchange: Promise<CachedToken> | undefined;

export function readKnowledgeConfig(): KnowledgeConfig | null {
  const url = process.env.KNOWLEDGE_URL?.trim();
  const apiKey = process.env.KNOWLEDGE_API_KEY?.trim();
  const accessUrl = process.env.KNOWLEDGE_ACCESS_URL?.trim();
  if (!url || !apiKey || !accessUrl) {
    return null;
  }

  let origin: URL;
  try {
    origin = new URL(accessUrl);
  } catch {
    throw new KnowledgeError("knowledge_invalid_access_url");
  }
  if (
    !["http:", "https:"].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  ) {
    throw new KnowledgeError("knowledge_invalid_access_url");
  }

  return { url, apiKey, accessUrl: origin.origin };
}

function requireConfig(): KnowledgeConfig {
  const config = readKnowledgeConfig();
  if (!config) {
    throw new KnowledgeError("knowledge_not_configured", 503);
  }
  return config;
}

function responseErrorCode(body: unknown): string {
  if (typeof body !== "object" || body === null || !("error" in body)) {
    return "knowledge_request_failed";
  }
  const code = body.error;
  const key = process.env.KNOWLEDGE_API_KEY?.trim();
  // Only accept a short machine code, never an upstream message or raw body.
  if (
    typeof code !== "string" ||
    !/^[a-z][a-z0-9_]{0,79}$/.test(code) ||
    code.startsWith("apk_") ||
    (key && code.includes(key))
  ) {
    return "knowledge_request_failed";
  }
  return code;
}

async function fetchJson<T>(url: string, init: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const signal = init.signal
    ? AbortSignal.any([controller.signal, init.signal])
    : controller.signal;
  try {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      redirect: "manual",
      signal,
    });
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      throw new KnowledgeError(responseErrorCode(body), response.status);
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof KnowledgeError) {
      throw error;
    }
    throw new KnowledgeError(
      controller.signal.aborted
        ? "knowledge_request_timeout"
        : "knowledge_request_failed",
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function requestToken(config: KnowledgeConfig): Promise<CachedToken> {
  const result = await fetchJson<{ token: string; expiresAt: string }>(
    `${config.accessUrl}/api/v1/access/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: config.apiKey }),
    },
  );
  const expiresAt = Date.parse(result.expiresAt);
  if (
    typeof result.token !== "string" ||
    !result.token ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= Date.now()
  ) {
    throw new KnowledgeError("knowledge_invalid_token_response");
  }
  return { token: result.token, expiresAt };
}

export async function exchange(): Promise<string> {
  const config = requireConfig();
  if (
    cachedToken &&
    Date.now() < cachedToken.expiresAt - TOKEN_REFRESH_MARGIN_MS
  ) {
    return cachedToken.token;
  }
  if (!pendingExchange) {
    pendingExchange = requestToken(config)
      .then((token) => {
        cachedToken = token;
        return token;
      })
      .finally(() => {
        pendingExchange = undefined;
      });
  }
  return (await pendingExchange).token;
}

export async function knowledgeFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const config = requireConfig();
  const url = new URL(path, config.url);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.origin !== new URL(config.url).origin ||
    url.username ||
    url.password
  ) {
    throw new KnowledgeError("knowledge_invalid_url");
  }
  const request = (token: string) => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    return fetchJson<T>(url.toString(), { ...init, headers });
  };
  const token = await exchange();
  try {
    return await request(token);
  } catch (error) {
    if (!(error instanceof KnowledgeError) || error.status !== 401) {
      throw error;
    }
    // A concurrent request may already have refreshed the rejected token.
    if (cachedToken?.token === token) {
      cachedToken = undefined;
    }
    return request(await exchange());
  }
}

export function search(
  request: SearchRequest,
): Promise<KnowledgeSearchResponse> {
  return knowledgeFetch<KnowledgeSearchResponse>("/api/knowledge/v1/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
}

export async function listCollections(): Promise<
  CollectionsResponse["collections"]
> {
  const response = await knowledgeFetch<{
    data: CollectionsResponse["collections"];
  }>("/api/knowledge/v1/collections");
  return response.data;
}

function logKnowledgeFailure(error: unknown) {
  console.warn("Knowledge request failed", {
    code:
      error instanceof KnowledgeError ? error.code : "knowledge_request_failed",
    status: error instanceof KnowledgeError ? error.status : 502,
  });
}

export async function knowledgeStatus(): Promise<StatusResponse["knowledge"]> {
  try {
    if (!readKnowledgeConfig()) {
      return "not-configured";
    }
    await listCollections();
    return "ready";
  } catch (error) {
    logKnowledgeFailure(error);
    return "unavailable";
  }
}

export function knowledgeErrorResponse(error: unknown): Response {
  const headers = { "Cache-Control": "no-store" };
  if (
    error instanceof KnowledgeError &&
    error.code === "knowledge_not_configured"
  ) {
    return Response.json(
      { error: "knowledge_not_configured" },
      { status: 503, headers },
    );
  }
  logKnowledgeFailure(error);
  return Response.json(
    { error: "knowledge_unavailable", message: "Knowledge is unavailable." },
    { status: 502, headers },
  );
}
