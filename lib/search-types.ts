export type SearchMode = "hybrid" | "lexical" | "vector";

export interface SearchHit {
  documentId: string;
  title: string;
  url: string;
  collection: string;
  chunkIndex: number;
  text: string;
  score: number;
  metadata?: {
    number?: number;
    category?: string;
    tags?: string[];
    updatedAt?: string;
    watchers?: number;
    stars?: number;
    comments?: number;
  };
}

export interface StatusResponse {
  knowledge: "ready" | "not-configured" | "unavailable";
  publicUrl: string | null;
  database: "ready" | "missing-url" | "unavailable";
  version: string;
}

export interface CollectionsResponse {
  collections: {
    name: string;
    description: string;
    visibility: string;
  }[];
}

export interface SearchResponse {
  query: string;
  mode: SearchMode;
  hits: SearchHit[];
  tookMs: number;
}

export interface HistoryResponse {
  items: {
    query: string;
    count: number;
    lastSearchedAt: string;
  }[];
}
