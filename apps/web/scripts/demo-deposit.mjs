// Dev helper: make one Privacy Pool deposit against the local node so the indexer and
// association endpoints have data to return. Run after `pnpm dev` (or a deployed local node):
//   node apps/web/scripts/demo-deposit.mjs
import { readFileSync } from "node:fs";
import { ethers } from "ethers";
import { PoolNote, toFixedHex } from "@privashh/sdk";

const dep = JSON.parse(
  readFileSync(new URL("../../../packages/contracts/deployments/localhost.json", import.meta.url))
);
const rpc = process.env.SHH_RPC_URL || "http://127.0.0.1:8545";
// Hardhat default funded account #0 (local dev only).
const pk = process.env.DEPLOYER_PRIVATE_KEY || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const wallet = new ethers.Wallet(pk, new ethers.JsonRpcProvider(rpc));
const pool = new ethers.Contract(dep.contracts.privacyPool, ["function deposit(bytes32) payable"], wallet);

const note = new PoolNote();
const commitment = await note.commitment();
const tx = await pool.deposit(toFixedHex(commitment), { value: dep.denomination });
await tx.wait();

console.log("deposited commitment:", toFixedHex(commitment));
console.log("save these secrets to withdraw later:");
console.log("  nullifier:", note.nullifier.toString());
console.log("  secret:   ", note.secret.toString());
