import { Contract, JsonRpcProvider, Wallet, type EventLog } from "ethers";
import { LEVELS, MerkleTree } from "@privashh/sdk";

// The shh Association Set Provider publisher.
//
// Withdrawals from the Privacy Pool must prove membership in an association-set Merkle root
// that the ASP has published on-chain. This daemon recomputes that root from the live deposit
// set and publishes it whenever it changes, so every deposit becomes withdrawable shortly after
// it lands. Older published roots stay valid (publishRoot never auto-revokes), so a proof built
// against any historically published root still verifies.
//
// POLICY (open-pool, option A): the association set = ALL deposits. A compliance-gated ASP would
// filter the commitment list before building the tree (and revoke roots that include a deposit
// later found non-compliant via AssociationSetProvider.revokeRoot). Plug that policy into
// `approvedCommitments`.

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`[asp-publisher] missing required env ${name}`);
    process.exit(1);
  }
  return v;
}

const RPC_URL = process.env.SHH_RPC_URL || "http://127.0.0.1:9545";
const POOL_ADDRESS = required("PRIVACY_POOL_ADDRESS");
const ASP_ADDRESS = required("ASP_ADDRESS");
const SIGNER_KEY = required("ASP_SIGNER_PRIVATE_KEY");
const POLL_MS = Number(process.env.POLL_INTERVAL_MS || 15000);
const DATA_URI = process.env.ASP_DATA_URI || "all-deposits";

const POOL_ABI = [
  "event Deposit(bytes32 indexed commitment, uint32 leafIndex, uint256 timestamp)",
];
const ASP_ABI = [
  "function asp() view returns (address)",
  "function currentRoot() view returns (uint256)",
  "function publishRoot(uint256 root, string dataURI)",
];

const provider = new JsonRpcProvider(RPC_URL);
const signer = new Wallet(SIGNER_KEY, provider);
const pool = new Contract(POOL_ADDRESS, POOL_ABI, provider);
const asp = new Contract(ASP_ADDRESS, ASP_ABI, signer);

/** All Privacy Pool deposit commitments, in insertion (leafIndex) order. */
async function approvedCommitments(): Promise<bigint[]> {
  const events = (await pool.queryFilter(pool.filters.Deposit(), 0, "latest")) as EventLog[];
  return events
    .map((e) => ({
      commitment: BigInt(e.args.commitment as string),
      leafIndex: Number(e.args.leafIndex),
    }))
    .sort((a, b) => a.leafIndex - b.leafIndex)
    .map((x) => x.commitment);
}

async function tick(): Promise<void> {
  const commitments = await approvedCommitments();
  if (commitments.length === 0) return; // nothing to publish until the first deposit

  // Must match the tree the client/backend builds for the withdrawal proof: same leaf set,
  // same insertion order, same depth — otherwise the published root won't match the proof's.
  const tree = await MerkleTree.create(commitments, LEVELS);
  const root = tree.root();

  const current: bigint = await asp.currentRoot();
  if (root === current) return; // already published the latest set

  const tx = await asp.publishRoot(root, DATA_URI);
  const receipt = await tx.wait();
  console.log(
    `[asp-publisher] published root ${root} over ${commitments.length} deposit(s) — tx ${receipt?.hash}`,
  );
}

async function main(): Promise<void> {
  const me = await signer.getAddress();
  const authorized: string = await asp.asp();
  if (authorized.toLowerCase() !== me.toLowerCase()) {
    console.error(
      `[asp-publisher] signer ${me} is not the authorized ASP (${authorized}); publishRoot would revert. Exiting.`,
    );
    process.exit(1);
  }
  console.log(
    `[asp-publisher] up. rpc=${RPC_URL} pool=${POOL_ADDRESS} asp=${ASP_ADDRESS} signer=${me} poll=${POLL_MS}ms`,
  );

  for (;;) {
    try {
      await tick();
    } catch (e) {
      console.error(`[asp-publisher] tick error: ${(e as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
