import { expect } from "chai";
import { ethers } from "hardhat";
import { MerkleTree, PoolNote, toFixedHex } from "@shh/sdk";
import { generatePoolWithdraw } from "@shh/sdk/node";
import { deployPoseidonHasher } from "./helpers/deploy";
import { POOL_WASM, POOL_ZKEY } from "./helpers/artifacts";

const DENOM = ethers.parseEther("1");
const LEVELS = 20;

async function deployPool() {
  const [deployer, recipient, relayer, asp] = await ethers.getSigners();

  const hasher = await deployPoseidonHasher(deployer);
  const verifier = await (await ethers.getContractFactory("PoolWithdrawVerifier")).deploy();
  const aspContract = await (
    await ethers.getContractFactory("AssociationSetProvider")
  ).deploy(asp.address);
  const pool = await (
    await ethers.getContractFactory("PrivacyPool")
  ).deploy(
    await verifier.getAddress(),
    await hasher.getAddress(),
    LEVELS,
    DENOM,
    await aspContract.getAddress(),
  );

  return {
    deployer,
    recipient,
    relayer,
    asp,
    hasher,
    verifier,
    aspContract,
    pool,
  };
}

describe("PrivacyPool", () => {
  it("inserts a deposit whose root matches the SDK tree", async () => {
    const { pool } = await deployPool();
    const note = new PoolNote();
    const commitment = await note.commitment();

    await (await pool.deposit(toFixedHex(commitment), { value: DENOM })).wait();

    const tree = await MerkleTree.create([commitment]);
    expect(await pool.getLastRoot()).to.equal(tree.root());
    expect(await pool.commitments(toFixedHex(commitment))).to.equal(true);
  });

  it("withdraws with a valid association proof, paying recipient and relayer", async () => {
    const { recipient, relayer, asp, aspContract, pool } = await deployPool();
    const note = new PoolNote();
    const commitment = await note.commitment();
    await (await pool.deposit(toFixedHex(commitment), { value: DENOM })).wait();

    const stateTree = await MerkleTree.create([commitment]);
    const associationTree = await MerkleTree.create([commitment]); // ASP approves this deposit
    await (
      await aspContract.connect(asp).publishRoot(associationTree.root(), "ipfs://set-1")
    ).wait();

    const fee = ethers.parseEther("0.01");
    const { proof, stateRoot, associationRoot, nullifierHash } = await generatePoolWithdraw({
      note,
      stateTree,
      associationTree,
      recipient: BigInt(recipient.address),
      relayer: BigInt(relayer.address),
      fee,
      refund: 0n,
      wasmPath: POOL_WASM,
      zkeyPath: POOL_ZKEY,
    });

    const recipientBefore = await ethers.provider.getBalance(recipient.address);
    const relayerBefore = await ethers.provider.getBalance(relayer.address);

    await (
      await pool.withdraw(
        proof.a,
        proof.b,
        proof.c,
        toFixedHex(stateRoot),
        toFixedHex(associationRoot),
        toFixedHex(nullifierHash),
        recipient.address,
        relayer.address,
        fee,
        0n,
      )
    ).wait();

    expect((await ethers.provider.getBalance(recipient.address)) - recipientBefore).to.equal(
      DENOM - fee,
    );
    expect((await ethers.provider.getBalance(relayer.address)) - relayerBefore).to.equal(fee);
    expect(await pool.nullifierHashes(toFixedHex(nullifierHash))).to.equal(true);
  });

  it("rejects a second withdrawal with the same nullifier (double spend)", async () => {
    const { recipient, relayer, asp, aspContract, pool } = await deployPool();
    const note = new PoolNote();
    const commitment = await note.commitment();
    await (await pool.deposit(toFixedHex(commitment), { value: DENOM })).wait();

    const stateTree = await MerkleTree.create([commitment]);
    const associationTree = await MerkleTree.create([commitment]);
    await (
      await aspContract.connect(asp).publishRoot(associationTree.root(), "ipfs://set-1")
    ).wait();

    const args = await generatePoolWithdraw({
      note,
      stateTree,
      associationTree,
      recipient: BigInt(recipient.address),
      relayer: BigInt(relayer.address),
      fee: 0n,
      refund: 0n,
      wasmPath: POOL_WASM,
      zkeyPath: POOL_ZKEY,
    });

    const call = () =>
      pool.withdraw(
        args.proof.a,
        args.proof.b,
        args.proof.c,
        toFixedHex(args.stateRoot),
        toFixedHex(args.associationRoot),
        toFixedHex(args.nullifierHash),
        recipient.address,
        relayer.address,
        0n,
        0n,
      );

    await (await call()).wait();
    await expect(call()).to.be.revertedWithCustomError(pool, "AlreadySpent");
  });

  it("blocks withdrawal when the association root is not published (unlockable gating)", async () => {
    const { recipient, relayer, pool } = await deployPool();
    const note = new PoolNote();
    const commitment = await note.commitment();
    await (await pool.deposit(toFixedHex(commitment), { value: DENOM })).wait();

    const stateTree = await MerkleTree.create([commitment]);
    const associationTree = await MerkleTree.create([commitment]); // never published by the ASP

    const args = await generatePoolWithdraw({
      note,
      stateTree,
      associationTree,
      recipient: BigInt(recipient.address),
      relayer: BigInt(relayer.address),
      fee: 0n,
      refund: 0n,
      wasmPath: POOL_WASM,
      zkeyPath: POOL_ZKEY,
    });

    await expect(
      pool.withdraw(
        args.proof.a,
        args.proof.b,
        args.proof.c,
        toFixedHex(args.stateRoot),
        toFixedHex(args.associationRoot),
        toFixedHex(args.nullifierHash),
        recipient.address,
        relayer.address,
        0n,
        0n,
      ),
    ).to.be.revertedWithCustomError(pool, "InvalidAssociationRoot");
  });

  it("rejects a proof reused for a different recipient (front-running protection)", async () => {
    const { recipient, relayer, asp, aspContract, pool, deployer } = await deployPool();
    const note = new PoolNote();
    const commitment = await note.commitment();
    await (await pool.deposit(toFixedHex(commitment), { value: DENOM })).wait();

    const stateTree = await MerkleTree.create([commitment]);
    const associationTree = await MerkleTree.create([commitment]);
    await (
      await aspContract.connect(asp).publishRoot(associationTree.root(), "ipfs://set-1")
    ).wait();

    const args = await generatePoolWithdraw({
      note,
      stateTree,
      associationTree,
      recipient: BigInt(recipient.address),
      relayer: BigInt(relayer.address),
      fee: 0n,
      refund: 0n,
      wasmPath: POOL_WASM,
      zkeyPath: POOL_ZKEY,
    });

    // Attacker swaps the recipient to themselves — the proof binds recipient, so it fails.
    await expect(
      pool.withdraw(
        args.proof.a,
        args.proof.b,
        args.proof.c,
        toFixedHex(args.stateRoot),
        toFixedHex(args.associationRoot),
        toFixedHex(args.nullifierHash),
        deployer.address,
        relayer.address,
        0n,
        0n,
      ),
    ).to.be.revertedWithCustomError(pool, "InvalidProof");
  });
});
