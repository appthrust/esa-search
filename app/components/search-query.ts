import type { SearchMode } from "@/lib/search-types";

export const SEARCH_MODES: { value: SearchMode; label: string }[] = [
  { value: "hybrid", label: "ハイブリッド" },
  { value: "lexical", label: "キーワード" },
  { value: "vector", label: "ベクトル" },
];

export const TOP_K_OPTIONS = [8, 20, 50] as const;

export const DEFAULT_MODE: SearchMode = "hybrid";
export const DEFAULT_TOP_K = 8;

export interface SearchQuery {
  q: string;
  mode: SearchMode;
  collections: string[];
  topK: number;
}

interface ParamsReader {
  get(name: string): string | null;
  getAll(name: string): string[];
}

function isSearchMode(value: string | null): value is SearchMode {
  return value === "hybrid" || value === "lexical" || value === "vector";
}

/** Reads the page URL (`?q=&mode=&collection=&topK=`) into a normalized query. */
export function parseSearchQuery(params: ParamsReader): SearchQuery {
  const mode = params.get("mode");
  const topK = Number(params.get("topK"));
  const collections = params
    .getAll("collection")
    .map((name) => name.trim())
    .filter((name, index, all) => name !== "" && all.indexOf(name) === index)
    .sort();

  return {
    q: (params.get("q") ?? "").trim(),
    mode: isSearchMode(mode) ? mode : DEFAULT_MODE,
    collections,
    topK: (TOP_K_OPTIONS as readonly number[]).includes(topK)
      ? topK
      : DEFAULT_TOP_K,
  };
}

/**
 * Serializes a query for the page URL. Defaults are omitted so shared links
 * stay short; the same shape (plus explicit mode/topK) is sent to /api/search.
 */
export function toPageParams(query: SearchQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.mode !== DEFAULT_MODE) params.set("mode", query.mode);
  for (const name of query.collections) params.append("collection", name);
  if (query.topK !== DEFAULT_TOP_K) params.set("topK", String(query.topK));
  return params;
}

export function toApiParams(query: SearchQuery): URLSearchParams {
  const params = new URLSearchParams();
  params.set("q", query.q);
  params.set("mode", query.mode);
  for (const name of query.collections) params.append("collection", name);
  params.set("topK", String(query.topK));
  return params;
}

export function modeLabel(mode: string): string {
  return SEARCH_MODES.find((entry) => entry.value === mode)?.label ?? mode;
}
