import { expect } from "chai";
import { ethers } from "hardhat";
import { Keypair, MerkleTree, Utxo } from "@shh/sdk";
import { generateTransaction } from "@shh/sdk/node";
import { deployPoseidonHasher } from "./helpers/deploy";
import { TX_WASM, TX_ZKEY } from "./helpers/artifacts";
import { toExtDataArg, toProofArgs } from "./helpers/format";

const LEVELS = 20;
const ZERO = ethers.ZeroAddress;

async function deployShieldedPool() {
  const [deployer, recipient, relayer] = await ethers.getSigners();
  const hasher = await deployPoseidonHasher(deployer);
  const verifier = await (await ethers.getContractFactory("Transaction2x2Verifier")).deploy();
  const pool = await (
    await ethers.getContractFactory("ShieldedPool")
  ).deploy(await verifier.getAddress(), await hasher.getAddress(), LEVELS);
  return { deployer, recipient, relayer, hasher, verifier, pool };
}

describe("ShieldedPool", () => {
  it("end-to-end: deposit, private transfer, withdraw", async () => {
    const { recipient, pool } = await deployShieldedPool();
    const commitments: bigint[] = [];

    const alice = await Keypair.generate();
    const bob = await Keypair.generate();

    // ── deposit 1 ETH as a shielded note to Alice ───────────────────────────
    const depositAmount = ethers.parseEther("1");
    const aliceNote = new Utxo({ amount: depositAmount, keypair: alice });
    {
      const tree = await MerkleTree.create(commitments);
      const txn = await generateTransaction({
        inputs: [],
        outputs: [aliceNote],
        tree,
        extAmount: depositAmount,
        fee: 0n,
        recipient: ZERO,
        relayer: ZERO,
        wasmPath: TX_WASM,
        zkeyPath: TX_ZKEY,
      });
      await (
        await pool.transact(toProofArgs(txn), toExtDataArg(txn.extData), {
          value: depositAmount,
        })
      ).wait();
      commitments.push(txn.outputCommitments[0], txn.outputCommitments[1]);
      aliceNote.index = 0;
    }

    // ── private transfer: Alice → Bob 0.6, change 0.4 to Alice ──────────────
    const bobNote = new Utxo({
      amount: ethers.parseEther("0.6"),
      keypair: bob,
    });
    const aliceChange = new Utxo({
      amount: ethers.parseEther("0.4"),
      keypair: alice,
    });
    {
      const tree = await MerkleTree.create(commitments);
      const txn = await generateTransaction({
        inputs: [aliceNote],
        outputs: [bobNote, aliceChange],
        tree,
        extAmount: 0n,
        fee: 0n,
        recipient: ZERO,
        relayer: ZERO,
        wasmPath: TX_WASM,
        zkeyPath: TX_ZKEY,
      });
      await (await pool.transact(toProofArgs(txn), toExtDataArg(txn.extData))).wait();
      bobNote.index = commitments.length; // first output of this tx
      aliceChange.index = commitments.length + 1;
      commitments.push(txn.outputCommitments[0], txn.outputCommitments[1]);
    }

    // ── withdraw: Bob spends his 0.6 note to an external recipient ───────────
    {
      const tree = await MerkleTree.create(commitments);
      const withdrawAmount = ethers.parseEther("0.6");
      const txn = await generateTransaction({
        inputs: [bobNote],
        outputs: [],
        tree,
        extAmount: -withdrawAmount,
        fee: 0n,
        recipient: recipient.address,
        relayer: ZERO,
        wasmPath: TX_WASM,
        zkeyPath: TX_ZKEY,
      });

      const before = await ethers.provider.getBalance(recipient.address);
      await (await pool.transact(toProofArgs(txn), toExtDataArg(txn.extData))).wait();
      expect((await ethers.provider.getBalance(recipient.address)) - before).to.equal(
        withdrawAmount,
      );
    }

    // pool retains the remaining 0.4 ETH (Alice's change note)
    expect(await ethers.provider.getBalance(await pool.getAddress())).to.equal(
      ethers.parseEther("0.4"),
    );
  });

  it("rejects spending the same note twice (nullifier reuse)", async () => {
    const { recipient, pool } = await deployShieldedPool();
    const commitments: bigint[] = [];
    const alice = await Keypair.generate();

    const depositAmount = ethers.parseEther("1");
    const aliceNote = new Utxo({ amount: depositAmount, keypair: alice });
    {
      const tree = await MerkleTree.create(commitments);
      const txn = await generateTransaction({
        inputs: [],
        outputs: [aliceNote],
        tree,
        extAmount: depositAmount,
        fee: 0n,
        recipient: ZERO,
        relayer: ZERO,
        wasmPath: TX_WASM,
        zkeyPath: TX_ZKEY,
      });
      await (
        await pool.transact(toProofArgs(txn), toExtDataArg(txn.extData), {
          value: depositAmount,
        })
      ).wait();
      commitments.push(txn.outputCommitments[0], txn.outputCommitments[1]);
      aliceNote.index = 0;
    }

    async function withdrawAll() {
      const tree = await MerkleTree.create(commitments);
      const txn = await generateTransaction({
        inputs: [aliceNote],
        outputs: [],
        tree,
        extAmount: -depositAmount,
        fee: 0n,
        recipient: recipient.address,
        relayer: ZERO,
        wasmPath: TX_WASM,
        zkeyPath: TX_ZKEY,
      });
      return pool.transact(toProofArgs(txn), toExtDataArg(txn.extData));
    }

    await (await withdrawAll()).wait();
    await expect(withdrawAll()).to.be.revertedWithCustomError(pool, "AlreadySpent");
  });
});
