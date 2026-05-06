import type { EventLog } from "ethers";
import { privacyPool, shieldedPool } from "./chain";

export interface PoolLeaf {
  commitment: string;
  leafIndex: number;
}

/** All Privacy Pool commitments in insertion order — enough to rebuild the state tree. */
export async function poolCommitments(): Promise<PoolLeaf[]> {
  const pool = privacyPool();
  const events = (await pool.queryFilter(pool.filters.Deposit(), 0, "latest")) as EventLog[];
  return events.map((e) => ({
    commitment: e.args.commitment as string,
    leafIndex: Number(e.args.leafIndex),
  }));
}

/** Shielded Pool note commitments + spent nullifiers (for client-side note scanning). */
export async function shieldedEvents() {
  const pool = shieldedPool();
  const commitments = (await pool.queryFilter(
    pool.filters.NewCommitment(),
    0,
    "latest",
  )) as EventLog[];
  const nullifiers = (await pool.queryFilter(
    pool.filters.NewNullifier(),
    0,
    "latest",
  )) as EventLog[];
  return {
    commitments: commitments.map((e) => ({
      commitment: e.args.commitment as string,
      leafIndex: Number(e.args.leafIndex),
      encryptedOutput: e.args.encryptedOutput as string,
    })),
    nullifiers: nullifiers.map((e) => e.args.nullifier as string),
  };
}
