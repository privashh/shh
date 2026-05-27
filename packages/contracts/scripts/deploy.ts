import { ethers, network } from "hardhat";
import { poseidonContract } from "circomlibjs";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

// L3-side privacy core deployment (PrivacyPool + ShieldedPool + verifiers + ASP).
// The Base-side L1ShieldedBridge and the L2 counterpart are wired in Phase 4 once the
// OP Stack portal address is known. See docs/workflow.md.
const LEVELS = 20;
const DENOMINATION = ethers.parseEther("1");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Network: ${network.name}  Deployer: ${deployer.address}`);

  // Poseidon(2) hasher — the EVM contract that matches the circuits.
  const hasher = await new ethers.ContractFactory(
    poseidonContract.generateABI(2) as any,
    poseidonContract.createCode(2),
    deployer,
  ).deploy();
  await hasher.waitForDeployment();

  const poolVerifier = await (await ethers.getContractFactory("PoolWithdrawVerifier")).deploy();
  const txVerifier = await (await ethers.getContractFactory("Transaction2x2Verifier")).deploy();

  const aspSigner = process.env.ASP_SIGNER_PRIVATE_KEY
    ? new ethers.Wallet(process.env.ASP_SIGNER_PRIVATE_KEY).address
    : deployer.address;
  const asp = await (await ethers.getContractFactory("AssociationSetProvider")).deploy(aspSigner);

  const privacyPool = await (
    await ethers.getContractFactory("PrivacyPool")
  ).deploy(
    await poolVerifier.getAddress(),
    await hasher.getAddress(),
    LEVELS,
    DENOMINATION,
    await asp.getAddress(),
  );

  const shieldedPool = await (
    await ethers.getContractFactory("ShieldedPool")
  ).deploy(await txVerifier.getAddress(), await hasher.getAddress(), LEVELS);

  for (const c of [poolVerifier, txVerifier, asp, privacyPool, shieldedPool]) {
    await c.waitForDeployment();
  }

  const deployment = {
    network: network.name,
    // full-privacy → ShieldedPool is the primary value layer; open-pool → transparent L3 + PrivacyPool
    profile: process.env.SHH_PROFILE || "open-pool",
    levels: LEVELS,
    denomination: DENOMINATION.toString(),
    aspSigner,
    contracts: {
      hasher: await hasher.getAddress(),
      poolWithdrawVerifier: await poolVerifier.getAddress(),
      transactionVerifier: await txVerifier.getAddress(),
      associationSetProvider: await asp.getAddress(),
      privacyPool: await privacyPool.getAddress(),
      shieldedPool: await shieldedPool.getAddress(),
    },
  };

  const dir = path.resolve(__dirname, "../deployments");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${network.name}.json`), JSON.stringify(deployment, null, 2) + "\n");
  console.log(JSON.stringify(deployment, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
