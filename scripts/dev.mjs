// One-command local stack: start a local chain, deploy the privacy core, copy circuit
// artifacts, and run the wallet backend. Prereq (once): `pnpm install && pnpm setup`.
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RPC = process.env.SHH_RPC_URL || "http://127.0.0.1:8545";
const children = [];

function spawnLong(cmd, args) {
  const child = spawn(cmd, args, { cwd: root, stdio: "inherit", shell: true });
  children.push(child);
  return child;
}

function spawnOnce(cmd, args) {
  return new Promise((res, rej) => {
    const child = spawn(cmd, args, { cwd: root, stdio: "inherit", shell: true });
    child.on("exit", (code) => (code === 0 ? res() : rej(new Error(`${cmd} ${args.join(" ")} exited ${code}`))));
  });
}

function shutdown() {
  for (const c of children) {
    try {
      c.kill();
    } catch {
      /* ignore */
    }
  }
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function waitForRpc() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(RPC, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
      });
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(1000);
  }
  throw new Error("local node did not become ready");
}

console.log("▶ starting local chain …");
spawnLong("pnpm", ["--filter", "@shh/contracts", "exec", "hardhat", "node"]);
await waitForRpc();

console.log("▶ deploying privacy core …");
await spawnOnce("pnpm", ["--filter", "@shh/contracts", "run", "deploy:local"]);

console.log("▶ copying circuit artifacts …");
await spawnOnce("node", ["scripts/copy-artifacts.mjs"]);

console.log("▶ starting wallet backend on http://localhost:3000 …");
spawnLong("pnpm", ["--filter", "@shh/web", "run", "dev"]);
