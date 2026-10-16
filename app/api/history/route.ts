import { recentSearches } from "@/lib/history";
import type { HistoryResponse } from "@/lib/search-types";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const requestedLimit = Number(new URL(request.url).searchParams.get("limit"));
  const limit =
    Number.isSafeInteger(requestedLimit) && requestedLimit > 0
      ? requestedLimit
      : 10;
  const body: HistoryResponse = { items: await recentSearches(limit) };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
