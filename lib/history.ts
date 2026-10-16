import "server-only";

import type { Pool } from "pg";
import { getPool } from "@/lib/db";
import type { HistoryResponse } from "@/lib/search-types";

let tableReady: Promise<void> | undefined;

async function ensureTable(pool: Pool): Promise<void> {
  if (!tableReady) {
    tableReady = pool
      .query(`
        CREATE TABLE IF NOT EXISTS search_history (
          query TEXT PRIMARY KEY,
          count INTEGER NOT NULL DEFAULT 1,
          last_searched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
      .then(() => undefined)
      .catch((error: unknown) => {
        // A temporary database outage must not prevent recovery in this process.
        tableReady = undefined;
        throw error;
      });
  }
  await tableReady;
}

export async function recordSearch(query: string): Promise<void> {
  try {
    const pool = getPool();
    if (!pool) {
      return;
    }
    await ensureTable(pool);
    await pool.query(
      `INSERT INTO search_history (query, count, last_searched_at)
       VALUES ($1, 1, NOW())
       ON CONFLICT (query) DO UPDATE
       SET count = search_history.count + 1, last_searched_at = NOW()`,
      [query],
    );
  } catch {
    console.warn("Search history could not be recorded.");
  }
}

export async function recentSearches(
  limit: number,
): Promise<HistoryResponse["items"]> {
  try {
    const pool = getPool();
    if (!pool) {
      return [];
    }
    await ensureTable(pool);
    const result = await pool.query<{
      query: string;
      count: number;
      last_searched_at: Date;
    }>(
      `SELECT query, count, last_searched_at
       FROM search_history
       ORDER BY last_searched_at DESC, query ASC
       LIMIT $1`,
      [limit],
    );
    return result.rows.map((row) => ({
      query: row.query,
      count: row.count,
      lastSearchedAt: row.last_searched_at.toISOString(),
    }));
  } catch {
    console.warn("Search history could not be loaded.");
    return [];
  }
}
