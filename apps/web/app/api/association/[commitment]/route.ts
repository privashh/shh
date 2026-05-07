import { LEVELS, MerkleTree } from "@shh/sdk";
import { poolCommitments } from "@/lib/indexer";

export const runtime = "nodejs";

// Returns the Merkle inclusion path of `commitment` within the current association set.
//
// SKELETON: the association set here is *all* deposits (placeholder). A real Association Set
// Provider applies a compliance policy — exclude flagged deposits before building the tree —
// and publishes the resulting root on-chain via AssociationSetProvider.publishRoot. Plug that
// policy in where `leaves` is assembled.
export async function GET(_req: Request, { params }: { params: Promise<{ commitment: string }> }) {
  const { commitment } = await params;
  try {
    const leaves = (await poolCommitments()).map((l) => BigInt(l.commitment));
    const target = BigInt(commitment);
    const index = leaves.findIndex((l) => l === target);
    if (index < 0) {
      return Response.json({ error: "commitment not in association set" }, { status: 404 });
    }
    const tree = await MerkleTree.create(leaves, LEVELS);
    const proof = tree.proof(index);
    return Response.json({
      root: tree.root().toString(),
      index,
      pathElements: proof.pathElements.map(String),
      pathIndices: proof.pathIndices.toString(),
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 503 });
  }
}
