import "server-only";

import { Pool } from "pg";
import type { StatusResponse } from "@/lib/search-types";

export interface DatabaseState {
  status: StatusResponse["database"];
  databaseUrlPresent: boolean;
  databaseName?: string;
  host?: string;
}

let pool: Pool | undefined;

export function getPool(): Pool | null {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    return null;
  }

  if (!pool) {
    pool = new Pool({
      connectionString,
      max: 4,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
      statement_timeout: 5_000,
      query_timeout: 5_000,
    });
    pool.on("error", () => {
      console.warn("Database pool is unavailable.");
    });
  }
  return pool;
}

export async function databaseState(): Promise<DatabaseState> {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    return { status: "missing-url", databaseUrlPresent: false };
  }

  const details = safeDatabaseUrl(connectionString);
  try {
    await getPool()!.query("SELECT 1");
    return { status: "ready", databaseUrlPresent: true, ...details };
  } catch {
    console.warn("Database status check failed.");
    return { status: "unavailable", databaseUrlPresent: true, ...details };
  }
}

function safeDatabaseUrl(connectionString: string) {
  try {
    const parsed = new URL(connectionString);
    return {
      databaseName: parsed.pathname.replace(/^\//, "") || undefined,
      host: parsed.hostname || undefined,
    };
  } catch {
    return {};
  }
}
