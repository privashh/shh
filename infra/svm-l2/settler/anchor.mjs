// Anchor the shh SVM devnet to Solana: every ANCHOR_INTERVAL_SECONDS, read the L2 ledger tip
// (finalized slot + blockhash) and post it as a Memo transaction on the settlement chain —
// the SVM twin of op-proposer. Phase 1 anchors the ledger tip; state commitments + DA batches
// come with the shielded pool (phase 2).
// Dependency-free (Node 18+ fetch + node:crypto ed25519), same policy as opkey-monitor.mjs.
//
//   env: SVM_RPC      (default http://svm-node:8899)            the L2 being anchored
//        L1_RPC       (default https://api.devnet.solana.com)   where anchors are posted
//        ANCHOR_INTERVAL_SECONDS (default 300)
//        KEYPAIR_PATH (default /data/anchor-keypair.json)       solana-keygen-compatible JSON
//
// The keypair is created on first boot and reused. Devnet airdrops are best-effort (heavily
// rate-limited); if the account is broke, fund the printed address at https://faucet.solana.com
// and the loop recovers on the next tick.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createPrivateKey, createPublicKey, randomBytes, sign } from "node:crypto";

const SVM_RPC = process.env.SVM_RPC || "http://svm-node:8899";
const L1_RPC = process.env.L1_RPC || "https://api.devnet.solana.com";
const INTERVAL = Math.max(30, Number(process.env.ANCHOR_INTERVAL_SECONDS || 300));
const KEYPAIR_PATH = process.env.KEYPAIR_PATH || "/data/anchor-keypair.json";
const MEMO_PROGRAM = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
const MIN_LAMPORTS = 10_000; // a memo tx costs 5000 lamports in fees

// --- base58 (Bitcoin alphabet) ---------------------------------------------------------------

const ALPHA = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function b58encode(buf) {
  let n = 0n;
  for (const b of buf) n = n * 256n + BigInt(b);
  let s = "";
  while (n > 0n) {
    s = ALPHA[Number(n % 58n)] + s;
    n /= 58n;
  }
  for (const b of buf) {
    if (b !== 0) break;
    s = "1" + s;
  }
  return s;
}

function b58decode(s) {
  let n = 0n;
  for (const c of s) {
    const i = ALPHA.indexOf(c);
    if (i < 0) throw new Error(`bad base58 char '${c}'`);
    n = n * 58n + BigInt(i);
  }
  let hex = n.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  let zeros = 0;
  for (const c of s) {
    if (c !== "1") break;
    zeros++;
  }
  return Buffer.concat([Buffer.alloc(zeros), Buffer.from(hex, "hex")]);
}

// --- ed25519 via node:crypto: wrap the 32-byte seed in PKCS8 DER ------------------------------

const PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

function keyFromSeed(seed) {
  const priv = createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, seed]), format: "der", type: "pkcs8" });
  const pub = createPublicKey(priv).export({ format: "der", type: "spki" }).subarray(-32);
  return { priv, pub };
}

function loadOrCreateKeypair() {
  if (existsSync(KEYPAIR_PATH)) {
    const arr = JSON.parse(readFileSync(KEYPAIR_PATH, "utf8"));
    return keyFromSeed(Buffer.from(arr.slice(0, 32)));
  }
  const seed = randomBytes(32);
  const k = keyFromSeed(seed);
  mkdirSync(dirname(KEYPAIR_PATH), { recursive: true });
  // solana-keygen format: JSON array of 64 bytes (seed || pubkey), so the same key works
  // with the solana CLI (`solana balance -k anchor-keypair.json`).
  writeFileSync(KEYPAIR_PATH, JSON.stringify([...seed, ...k.pub]));
  return k;
}

// --- minimal Solana legacy transaction: one signer, one Memo instruction ----------------------

function shortvec(n) {
  const out = [];
  for (;;) {
    const b = n & 0x7f;
    n >>= 7;
    if (n === 0) {
      out.push(b);
      break;
    }
    out.push(b | 0x80);
  }
  return Buffer.from(out);
}

function buildMemoTx({ pub, priv, blockhash, memo }) {
  const data = Buffer.from(memo, "utf8");
  const message = Buffer.concat([
    Buffer.from([1, 0, 1]), // 1 signature required; 0 ro signed; 1 ro unsigned (the program)
    shortvec(2),
    pub,
    b58decode(MEMO_PROGRAM),
    b58decode(blockhash),
    shortvec(1), // one instruction
    Buffer.from([1]), // program id index
    shortvec(0), // memo needs no accounts
    shortvec(data.length),
    data,
  ]);
  const sig = sign(null, message, priv);
  return Buffer.concat([shortvec(1), sig, message]).toString("base64");
}

// --- JSON-RPC ---------------------------------------------------------------------------------

async function rpc(url, method, params = []) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const j = await r.json();
  if (j.error) throw new Error(`${method}: ${JSON.stringify(j.error)}`);
  return j.result;
}

// --- main loop --------------------------------------------------------------------------------

const { priv, pub } = loadOrCreateKeypair();
const me = b58encode(pub);
console.log(`[settler] anchor key ${me} (fund at https://faucet.solana.com if airdrops fail)`);
console.log(`[settler] anchoring ${SVM_RPC} -> ${L1_RPC} every ${INTERVAL}s`);

async function ensureFunds() {
  const bal = (await rpc(L1_RPC, "getBalance", [me])).value;
  if (bal >= MIN_LAMPORTS) return true;
  console.log(`[settler] balance ${bal} lamports — requesting a devnet airdrop (best effort)`);
  try {
    await rpc(L1_RPC, "requestAirdrop", [me, 1_000_000_000]);
    await new Promise((r) => setTimeout(r, 15_000));
    return (await rpc(L1_RPC, "getBalance", [me])).value >= MIN_LAMPORTS;
  } catch (e) {
    console.error(`[settler] airdrop failed (${e.message}) — fund ${me} manually, will retry`);
    return false;
  }
}

async function tick() {
  const slot = await rpc(SVM_RPC, "getSlot", [{ commitment: "finalized" }]);
  const tip = (await rpc(SVM_RPC, "getLatestBlockhash", [{ commitment: "finalized" }])).value;
  const memo = `shh-svm|v0|slot=${slot}|blockhash=${tip.blockhash}`;
  if (!(await ensureFunds())) return;
  const l1hash = (await rpc(L1_RPC, "getLatestBlockhash", [{ commitment: "finalized" }])).value.blockhash;
  const tx = buildMemoTx({ pub, priv, blockhash: l1hash, memo });
  const sig = await rpc(L1_RPC, "sendTransaction", [tx, { encoding: "base64", preflightCommitment: "confirmed" }]);
  console.log(`[settler] anchored slot ${slot} -> ${sig}`);
}

for (;;) {
  try {
    await tick();
  } catch (e) {
    console.error(`[settler] tick failed: ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, INTERVAL * 1000));
}
