import { knowledgeErrorResponse, listCollections } from "@/lib/knowledge";
import type { CollectionsResponse } from "@/lib/search-types";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const body: CollectionsResponse = { collections: await listCollections() };
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return knowledgeErrorResponse(error);
  }
}
