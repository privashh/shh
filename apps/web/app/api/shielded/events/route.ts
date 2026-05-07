import { shieldedEvents } from "@/lib/indexer";

export const runtime = "nodejs";

export async function GET() {
  try {
    return Response.json(await shieldedEvents());
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 503 });
  }
}
