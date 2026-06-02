import { MerkleTree } from "./merkleTree";
import { poseidon } from "./poseidon";
import { randomField } from "./random";

/** A fixed-denomination Privacy Pool note: commitment = Poseidon(nullifier, secret). */
export class PoolNote {
  readonly nullifier: bigint;
  readonly secret: bigint;

  constructor(nullifier: bigint = randomField(), secret: bigint = randomField()) {
    this.nullifier = nullifier;
    this.secret = secret;
  }

  commitment(): Promise<bigint> {
    return poseidon([this.nullifier, this.secret]);
  }

  nullifierHash(): Promise<bigint> {
    return poseidon([this.nullifier]);
  }
}

export interface PoolWithdrawInputParams {
  note: PoolNote;
  stateTree: MerkleTree;
  associationTree: MerkleTree;
  recipient: bigint; // address encoded as uint
  relayer: bigint;
  fee: bigint;
  refund: bigint;
}

export interface PoolWithdrawInput {
  input: Record<string, unknown>;
  stateRoot: bigint;
  associationRoot: bigint;
  nullifierHash: bigint;
}

/**
 * Build the circuit witness input for a Privacy Pool withdrawal (browser-safe — no proving).
 * Feed `input` to a Groth16 prover (`@privashh/sdk/node` in Node, or a snarkjs Web Worker in the
 * browser).
 */
export async function buildPoolWithdrawInput(
  params: PoolWithdrawInputParams,
): Promise<PoolWithdrawInput> {
  const commitment = await params.note.commitment();
  const stateIndex = params.stateTree.indexOf(commitment);
  const assocIndex = params.associationTree.indexOf(commitment);
  if (stateIndex < 0) throw new Error("commitment not in state tree");
  if (assocIndex < 0) throw new Error("commitment not in association tree");

  const sp = params.stateTree.proof(stateIndex);
  const ap = params.associationTree.proof(assocIndex);
  const nullifierHash = await params.note.nullifierHash();
  const stateRoot = params.stateTree.root();
  const associationRoot = params.associationTree.root();

  const input = {
    stateRoot,
    associationRoot,
    nullifierHash,
    recipient: params.recipient,
    relayer: params.relayer,
    fee: params.fee,
    refund: params.refund,
    nullifier: params.note.nullifier,
    secret: params.note.secret,
    statePathElements: sp.pathElements,
    statePathIndices: sp.pathIndices,
    assocPathElements: ap.pathElements,
    assocPathIndices: ap.pathIndices,
  };

  return { input, stateRoot, associationRoot, nullifierHash };
}
