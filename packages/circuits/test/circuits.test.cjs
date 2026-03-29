"use strict";
// Circuit-level tests: a valid witness proves and verifies against the real proving/
// verification keys; a tampered witness fails the circuit's constraints. Self-contained
// (poseidon-lite + snarkjs), independent of the Solidity layer.
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const snarkjs = require("snarkjs");
const { poseidon1, poseidon2, poseidon3 } = require("poseidon-lite");

// snarkjs builds a bn128 worker-thread pool; terminate it so the process exits cleanly.
after(async () => {
  try {
    if (globalThis.curve_bn128) await globalThis.curve_bn128.terminate();
  } catch {
    /* ignore */
  }
});

const LEVELS = 20;
const root = path.resolve(__dirname, "..");
const art = (name, ...p) => path.join(root, ...p);

const POOL = {
  wasm: art("", "build", "poolWithdraw", "poolWithdraw_js", "poolWithdraw.wasm"),
  zkey: art("", "keys", "poolWithdraw_final.zkey"),
  vkey: art("", "keys", "poolWithdraw_vkey.json"),
};
const TX = {
  wasm: art("", "build", "transaction2x2", "transaction2x2_js", "transaction2x2.wasm"),
  zkey: art("", "keys", "transaction2x2_final.zkey"),
  vkey: art("", "keys", "transaction2x2_vkey.json"),
};

function computeRoot(leaf, pathElements, pathIndices) {
  let h = leaf;
  for (let i = 0; i < pathElements.length; i++) {
    const bit = (pathIndices >> BigInt(i)) & 1n;
    h = bit ? poseidon2([pathElements[i], h]) : poseidon2([h, pathElements[i]]);
  }
  return h;
}

async function proveAndVerify(input, c) {
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, c.wasm, c.zkey);
  const vkey = JSON.parse(readFileSync(c.vkey, "utf8"));
  return snarkjs.groth16.verify(vkey, publicSignals, proof);
}

function validPoolInput() {
  const nullifier = 111n;
  const secret = 222n;
  const commitment = poseidon2([nullifier, secret]);
  const nullifierHash = poseidon1([nullifier]);
  const statePathElements = Array.from({ length: LEVELS }, (_, i) => BigInt(i + 1));
  const assocPathElements = Array.from({ length: LEVELS }, (_, i) => BigInt(i + 100));
  return {
    stateRoot: computeRoot(commitment, statePathElements, 0n),
    associationRoot: computeRoot(commitment, assocPathElements, 0n),
    nullifierHash,
    recipient: 0x1234n,
    relayer: 0x5678n,
    fee: 0n,
    refund: 0n,
    nullifier,
    secret,
    statePathElements,
    statePathIndices: 0n,
    assocPathElements,
    assocPathIndices: 0n,
  };
}

function validTxInput() {
  const noteCommit = (amount, k, blinding) => poseidon3([amount, poseidon1([k]), blinding]);
  const nullifierOf = (commitment, k, pathIndex) =>
    poseidon3([commitment, pathIndex, poseidon3([k, commitment, pathIndex])]);

  // two distinct dummy inputs (amount 0 ⇒ their Merkle proofs are not enforced)
  const c0 = noteCommit(0n, 1n, 10n);
  const c1 = noteCommit(0n, 2n, 20n);
  const zeros = Array.from({ length: LEVELS }, () => 0n);

  // outputs: 100 to an owner key, 0 dummy — deposit of 100 (publicAmount = 100)
  const opk = poseidon1([3n]);
  return {
    root: 0n,
    publicAmount: 100n,
    extDataHash: 12345n,
    inputNullifier: [nullifierOf(c0, 1n, 0n), nullifierOf(c1, 2n, 0n)],
    outputCommitment: [poseidon3([100n, opk, 30n]), poseidon3([0n, opk, 40n])],
    inAmount: [0n, 0n],
    inPrivateKey: [1n, 2n],
    inBlinding: [10n, 20n],
    inPathIndices: [0n, 0n],
    inPathElements: [zeros, zeros],
    outAmount: [100n, 0n],
    outPubkey: [opk, opk],
    outBlinding: [30n, 40n],
  };
}

test("poolWithdraw: valid witness proves and verifies", async () => {
  assert.equal(await proveAndVerify(validPoolInput(), POOL), true);
});

test("poolWithdraw: wrong nullifierHash violates constraints", async () => {
  const input = validPoolInput();
  input.nullifierHash = input.nullifierHash + 1n;
  await assert.rejects(() => snarkjs.groth16.fullProve(input, POOL.wasm, POOL.zkey));
});

test("transaction2x2: valid deposit witness proves and verifies", async () => {
  assert.equal(await proveAndVerify(validTxInput(), TX), true);
});

test("transaction2x2: broken value conservation violates constraints", async () => {
  const input = validTxInput();
  input.publicAmount = 99n; // 0 + 99 !== 100
  await assert.rejects(() => snarkjs.groth16.fullProve(input, TX.wasm, TX.zkey));
});
