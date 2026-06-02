"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  FIELD_SIZE,
  LEVELS,
  ZERO_VALUE,
  poseidon,
  toFixedHex,
  MerkleTree,
  PoolNote,
  buildPoolWithdrawInput,
  Keypair,
  Utxo,
  buildTransactionInput,
  hashExtData,
} = require("@privashh/sdk");

test("ZERO_VALUE matches the on-chain literal", () => {
  assert.equal(
    ZERO_VALUE,
    13602612579684615825605231132845818358075790636291508357134507789605889596141n,
  );
});

test("toFixedHex left-pads to bytes32", () => {
  assert.equal(toFixedHex(1n), "0x" + "0".repeat(63) + "1");
  assert.equal(toFixedHex(255n).length, 66);
});

test("poseidon dispatches by arity, is deterministic, rejects unsupported arity", async () => {
  const a = await poseidon([1n, 2n]);
  assert.equal(a, await poseidon([1n, 2n]));
  assert.ok(a < FIELD_SIZE);
  await assert.rejects(() => poseidon([1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n]));
});

test("empty Merkle tree root equals the zeros chain", async () => {
  const tree = await MerkleTree.create([]);
  let z = ZERO_VALUE;
  for (let i = 0; i < LEVELS; i++) z = await poseidon([z, z]);
  assert.equal(tree.root(), z);
});

test("Merkle inclusion path recomputes the root", async () => {
  const leaves = [];
  for (let i = 0; i < 5; i++) leaves.push(await poseidon([BigInt(i), 7n]));
  const tree = await MerkleTree.create(leaves);
  const index = 3;
  const { pathElements, pathIndices } = tree.proof(index);
  let h = leaves[index];
  for (let i = 0; i < LEVELS; i++) {
    const isRight = (pathIndices >> BigInt(i)) & 1n;
    h = isRight ? await poseidon([pathElements[i], h]) : await poseidon([h, pathElements[i]]);
  }
  assert.equal(h, tree.root());
});

test("PoolNote commitment and nullifierHash are the documented hashes", async () => {
  const note = new PoolNote(123n, 456n);
  assert.equal(await note.commitment(), await poseidon([123n, 456n]));
  assert.equal(await note.nullifierHash(), await poseidon([123n]));
});

test("buildPoolWithdrawInput yields roots matching the trees", async () => {
  const note = new PoolNote();
  const commitment = await note.commitment();
  const stateTree = await MerkleTree.create([commitment]);
  const associationTree = await MerkleTree.create([commitment]);
  const built = await buildPoolWithdrawInput({
    note,
    stateTree,
    associationTree,
    recipient: 1n,
    relayer: 2n,
    fee: 0n,
    refund: 0n,
  });
  assert.equal(built.stateRoot, stateTree.root());
  assert.equal(built.associationRoot, associationTree.root());
  assert.equal(built.nullifierHash, await note.nullifierHash());
});

test("Utxo note hashes match; transaction witness conserves value", async () => {
  const alice = await Keypair.generate();
  const note = new Utxo({ amount: 1000n, keypair: alice });
  const commitment = await note.getCommitment();
  assert.equal(commitment, await poseidon([1000n, alice.pubkey, note.blinding]));

  const tree = await MerkleTree.create([commitment]);
  note.index = 0;
  const change = new Utxo({ amount: 400n, keypair: alice });
  const built = await buildTransactionInput({
    inputs: [note],
    outputs: [change],
    tree,
    extAmount: -600n,
    fee: 0n,
    recipient: "0x0000000000000000000000000000000000000001",
    relayer: "0x0000000000000000000000000000000000000000",
  });
  // Σ inAmounts + publicAmount ≡ Σ outAmounts  (mod p)
  assert.equal((1000n + built.publicAmount) % FIELD_SIZE, 400n % FIELD_SIZE);
});

test("hashExtData is a field element", () => {
  const h = hashExtData({
    recipient: "0x0000000000000000000000000000000000000001",
    extAmount: -5n,
    relayer: "0x0000000000000000000000000000000000000002",
    fee: 1n,
    encryptedOutput1: "0x",
    encryptedOutput2: "0x",
  });
  assert.ok(h >= 0n && h < FIELD_SIZE);
});
