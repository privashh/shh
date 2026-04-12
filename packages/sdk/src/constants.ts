import { keccak256, toUtf8Bytes } from "ethers";

/** BN254 scalar field — the field every commitment/nullifier/Merkle node lives in. */
export const FIELD_SIZE =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/** Merkle tree depth shared by every shh tree (state + association). */
export const LEVELS = 20;

/** Nothing-up-my-sleeve empty-leaf value: keccak256("shh") mod p. */
export const ZERO_VALUE = BigInt(keccak256(toUtf8Bytes("shh"))) % FIELD_SIZE;
