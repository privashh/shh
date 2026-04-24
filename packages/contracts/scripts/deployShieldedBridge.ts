import { ethers, network } from "hardhat";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// Deploy the shielded bridge. Cross-network, so run once per side:
//
//   # on shh (L3): deploy the L2 side and wire it into the PrivacyPool
//   BRIDGE_SIDE=l2 L1_BRIDGE_ADDRESS=0x... npx hardhat run scripts/deployShieldedBridge.ts --network localhost
//
//   # on Base (L1): deploy the L1 side against the OP portal for shh
//   BRIDGE_SIDE=l1 PORTAL_ADDRESS=0x... L2_BRIDGE_ADDRESS=0x... npx hardhat run scripts/deployShieldedBridge.ts --network baseSepolia
//
// Because both sides reference each other immutably, predict the L1 bridge address first
// (ethers.getCreateAddress on the Base deployer) and pass it as L1_BRIDGE_ADDRESS to the L2 run.
function loadDeployment(): any {
  const p = path.resolve(__dirname, `../deployments/${network.name}.json`);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
}

async function main() {
  const side = process.env.BRIDGE_SIDE;
  const deployment = loadDeployment();

  if (side === "l2") {
    const pool = process.env.POOL_ADDRESS ?? deployment?.contracts?.privacyPool;
    const l1Bridge = process.env.L1_BRIDGE_ADDRESS;
    // L2StandardBridge is the canonical OP Stack predeploy.
    const l2StandardBridge =
      process.env.L2_STANDARD_BRIDGE ?? "0x4200000000000000000000000000000000000010";
    if (!pool || !l1Bridge) throw new Error("set POOL_ADDRESS (PrivacyPool) and L1_BRIDGE_ADDRESS");

    const l2 = await (
      await ethers.getContractFactory("L2ShieldedBridge")
    ).deploy(pool, l1Bridge, l2StandardBridge);
    await l2.waitForDeployment();

    const poolContract = await ethers.getContractAt("PrivacyPool", pool);
    await (await poolContract.setBridge(await l2.getAddress())).wait();
    console.log("L2ShieldedBridge:", await l2.getAddress(), "→ pool.bridge set");
  } else if (side === "l1") {
    const portal = process.env.PORTAL_ADDRESS;
    const l2Bridge = process.env.L2_BRIDGE_ADDRESS;
    const denom = process.env.DENOMINATION ?? ethers.parseEther("0.1").toString();
    if (!portal || !l2Bridge)
      throw new Error("set PORTAL_ADDRESS (OptimismPortal) and L2_BRIDGE_ADDRESS");

    const l1 = await (
      await ethers.getContractFactory("L1ShieldedBridge")
    ).deploy(portal, l2Bridge, denom);
    await l1.waitForDeployment();
    console.log("L1ShieldedBridge:", await l1.getAddress());
  } else {
    throw new Error("set BRIDGE_SIDE=l1|l2");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
