/**
 * Client-side JSON fetch against this app's own `/api/*` routes.
 * Never throws for HTTP or network failures: callers render error states
 * keyed by `error` (the backend's error code, or `network`/`http_<status>`).
 * Aborted requests resolve to `null` so superseded calls can be ignored.
 */
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; message: string | null };

export async function getJson<T>(
  path: string,
  signal?: AbortSignal,
): Promise<ApiResult<T> | null> {
  let response: Response;
  try {
    response = await fetch(path, {
      signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    if (signal?.aborted) return null;
    return {
      ok: false,
      status: 0,
      error: "network",
      message: error instanceof Error ? error.message : null,
    };
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    if (signal?.aborted) return null;
    // Non-JSON body (e.g. a 404 HTML page): fall through with body = null.
  }

  if (response.ok && body !== null) return { ok: true, data: body as T };

  const record =
    body !== null && typeof body === "object"
      ? (body as Record<string, unknown>)
      : {};
  return {
    ok: false,
    status: response.status,
    error:
      typeof record.error === "string" ? record.error : `http_${response.status}`,
    message: typeof record.message === "string" ? record.message : null,
  };
}
