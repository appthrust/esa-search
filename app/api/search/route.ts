import { recordSearch } from "@/lib/history";
import { KnowledgeError, knowledgeErrorResponse, search } from "@/lib/knowledge";
import type { SearchResponse } from "@/lib/search-types";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const startedAt = performance.now();
  const params = new URL(request.url).searchParams;
  const query = (params.get("q") ?? "").trim();
  const headers = { "Cache-Control": "no-store" };
  if (!query) {
    return Response.json({ error: "query_required" }, { status: 400, headers });
  }
  if (Buffer.byteLength(query, "utf8") > 16_384) {
    return Response.json({ error: "query_too_long" }, { status: 400, headers });
  }

  const rawTopK = params.get("topK");
  const topK = rawTopK === null ? 8 : Number(rawTopK);
  if (
    (rawTopK !== null && !/^\d+$/.test(rawTopK)) ||
    !Number.isInteger(topK) ||
    topK < 1 ||
    topK > 50
  ) {
    return Response.json({ error: "invalid_top_k" }, { status: 400, headers });
  }
  const mode = params.get("mode") ?? "hybrid";
  if (mode !== "hybrid" && mode !== "lexical" && mode !== "vector") {
    return Response.json({ error: "invalid_mode" }, { status: 400, headers });
  }

  try {
    const result = await search({
      query,
      collections: params.getAll("collection"),
      topK,
      mode,
    });
    // Await best-effort persistence so the next history request sees this query.
    await recordSearch(query).catch(() => {
      console.warn("Search history could not be recorded.");
    });
    const body: SearchResponse = {
      query,
      mode: result.mode,
      hits: result.hits,
      tookMs: Math.round(performance.now() - startedAt),
    };
    return Response.json(body, { headers });
  } catch (error) {
    if (
      error instanceof KnowledgeError &&
      error.status === 403 &&
      error.code === "key_not_permitted"
    ) {
      return Response.json(
        { error: "key_not_permitted" },
        { status: 403, headers },
      );
    }
    return knowledgeErrorResponse(error);
  }
}
