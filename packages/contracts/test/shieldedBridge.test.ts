import { expect } from "chai";
import { ethers } from "hardhat";
import { impersonateAccount, setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { MerkleTree, PoolNote, toFixedHex } from "@shh/sdk";
import { generatePoolWithdraw } from "@shh/sdk/node";
import { deployPoseidonHasher } from "./helpers/deploy";
import { POOL_WASM, POOL_ZKEY } from "./helpers/artifacts";

const DENOM = ethers.parseEther("1");
const LEVELS = 20;
const ALIAS_OFFSET = 0x1111000000000000000000000000000000001111n;

function applyL1ToL2Alias(addr: string): string {
  const aliased = (BigInt(addr) + ALIAS_OFFSET) % (1n << 160n);
  return ethers.getAddress(ethers.zeroPadValue(ethers.toBeHex(aliased), 20));
}

async function deploy() {
  const [deployer, asp, relayer, l1Recipient] = await ethers.getSigners();
  const l1Bridge = ethers.Wallet.createRandom().address;

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
  const stdBridge = await (await ethers.getContractFactory("MockL2StandardBridge")).deploy();
  const l2Bridge = await (
    await ethers.getContractFactory("L2ShieldedBridge")
  ).deploy(await pool.getAddress(), l1Bridge, await stdBridge.getAddress());
  await (await pool.setBridge(await l2Bridge.getAddress())).wait();

  return {
    deployer,
    asp,
    relayer,
    l1Recipient,
    l1Bridge,
    aspContract,
    pool,
    stdBridge,
    l2Bridge,
  };
}

describe("ShieldedBridge", () => {
  it("finalizes a Base-side deposit straight into the Privacy Pool as a shielded note", async () => {
    const { l1Bridge, pool, l2Bridge } = await deploy();

    const note = new PoolNote();
    const commitment = await note.commitment();
    const aliased = applyL1ToL2Alias(l1Bridge);
    await impersonateAccount(aliased);
    await setBalance(aliased, ethers.parseEther("10"));
    const portalSigner = await ethers.getSigner(aliased);

    await (
      await l2Bridge
        .connect(portalSigner)
        .finalizeShieldedDeposit(toFixedHex(commitment), { value: DENOM })
    ).wait();

    expect(await pool.commitments(toFixedHex(commitment))).to.equal(true);
    expect(await ethers.provider.getBalance(await pool.getAddress())).to.equal(DENOM);
    const tree = await MerkleTree.create([commitment]);
    expect(await pool.getLastRoot()).to.equal(tree.root());
  });

  it("rejects a finalize call from a non-aliased sender", async () => {
    const { pool, l2Bridge } = await deploy();
    const [, , , , attacker] = await ethers.getSigners();
    const note = new PoolNote();
    const commitment = await note.commitment();
    await expect(
      l2Bridge.connect(attacker).finalizeShieldedDeposit(toFixedHex(commitment), { value: DENOM }),
    ).to.be.revertedWithCustomError(l2Bridge, "Unauthorized");
    expect(await pool.commitments(toFixedHex(commitment))).to.equal(false);
  });

  it("withdraws a shielded note out to Base via the canonical bridge", async () => {
    const { asp, relayer, l1Recipient, aspContract, pool, l2Bridge } = await deploy();

    // deposit a note into the pool
    const note = new PoolNote();
    const commitment = await note.commitment();
    await (await pool.deposit(toFixedHex(commitment), { value: DENOM })).wait();

    const stateTree = await MerkleTree.create([commitment]);
    const associationTree = await MerkleTree.create([commitment]);
    await (
      await aspContract.connect(asp).publishRoot(associationTree.root(), "ipfs://set-1")
    ).wait();

    // the proof must bind the recipient to the L2 bridge, which forwards to Base
    const fee = ethers.parseEther("0.01");
    const { proof, stateRoot, associationRoot, nullifierHash } = await generatePoolWithdraw({
      note,
      stateTree,
      associationTree,
      recipient: BigInt(await l2Bridge.getAddress()),
      relayer: BigInt(relayer.address),
      fee,
      refund: 0n,
      wasmPath: POOL_WASM,
      zkeyPath: POOL_ZKEY,
    });

    const recipientBefore = await ethers.provider.getBalance(l1Recipient.address);
    const relayerBefore = await ethers.provider.getBalance(relayer.address);

    await (
      await l2Bridge.bridgeWithdraw(
        proof.a,
        proof.b,
        proof.c,
        toFixedHex(stateRoot),
        toFixedHex(associationRoot),
        toFixedHex(nullifierHash),
        l1Recipient.address,
        relayer.address,
        fee,
        200_000,
      )
    ).wait();

    expect((await ethers.provider.getBalance(l1Recipient.address)) - recipientBefore).to.equal(
      DENOM - fee,
    );
    expect((await ethers.provider.getBalance(relayer.address)) - relayerBefore).to.equal(fee);
    expect(await pool.nullifierHashes(toFixedHex(nullifierHash))).to.equal(true);
    expect(await ethers.provider.getBalance(await pool.getAddress())).to.equal(0n);
  });
});
