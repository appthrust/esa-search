import { databaseState } from "@/lib/db";
import { knowledgeStatus } from "@/lib/knowledge";
import type { StatusResponse } from "@/lib/search-types";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const [knowledge, database] = await Promise.all([
    knowledgeStatus(),
    databaseState(),
  ]);
  const body: StatusResponse = {
    knowledge,
    publicUrl: process.env.KNOWLEDGE_PUBLIC_URL?.trim() || null,
    database: database.status,
    version:
      process.env.VERSION || process.env.APTH_COMPONENT_VERSION || "unset",
  };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
