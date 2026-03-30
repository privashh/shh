import {
  poseidon1,
  poseidon2,
  poseidon3,
  poseidon4,
  poseidon5,
  poseidon6,
  poseidon7,
  poseidon8,
} from "poseidon-lite";

type PoseidonFn = (inputs: (bigint | string | number)[]) => bigint;

const BY_ARITY: Record<number, PoseidonFn> = {
  1: poseidon1,
  2: poseidon2,
  3: poseidon3,
  4: poseidon4,
  5: poseidon5,
  6: poseidon6,
  7: poseidon7,
  8: poseidon8,
};

/**
 * Poseidon hash, circomlib-compatible and isomorphic (pure JS via poseidon-lite — no wasm,
 * no node builtins). Verified byte-for-byte equal to the circuit's Poseidon and the on-chain
 * hasher. Kept async so call sites are stable.
 */
export async function poseidon(inputs: (bigint | string | number)[]): Promise<bigint> {
  const fn = BY_ARITY[inputs.length];
  if (!fn) throw new Error(`unsupported Poseidon arity: ${inputs.length}`);
  return fn(inputs.map((x) => BigInt(x)));
}

/** Left-padded 0x hex of a field element (default 32 bytes / bytes32). */
export function toFixedHex(value: bigint, length = 32): string {
  return "0x" + value.toString(16).padStart(length * 2, "0");
}
