import { poolCommitments } from "@/lib/indexer";

export const runtime = "nodejs";

export async function GET() {
  try {
    const leaves = await poolCommitments();
    return Response.json({ count: leaves.length, leaves });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 503 });
  }
}
