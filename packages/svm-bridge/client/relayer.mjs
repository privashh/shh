// Bridge relayer: watches the L1 bridge program for deposits and credits the same amount on
// the L2. Phase 1 of the deposit path — the L2 credit comes from a relayer-held treasury
// (airdropped on the devnet), not from minting; see README for the trust model and roadmap.
//
//   env: BRIDGE_PROGRAM_ID                                  required
//        L1_RPC      (default https://api.devnet.solana.com) where the bridge program lives
//        SVM_RPC     (default http://svm-node:8899)          the L2 being credited
//        TREASURY_KEYPAIR (default /data/treasury.json)      L2 funds source, created on boot
//        STATE_PATH  (default /data/relayer-state.json)      processed deposits + cursor
//        POLL_SECONDS (default 15)
//
// Deposits are identified by the program's log line:
//   shh-bridge:deposit|<nonce>|<l2 recipient>|<lamports>
// The nonce makes crediting idempotent across restarts and RPC replays.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { SOL, loadOrCreateKeypair } from "./lib.mjs";

const PROGRAM_ID = new PublicKey(required("BRIDGE_PROGRAM_ID"));
const L1_RPC = process.env.L1_RPC || "https://api.devnet.solana.com";
const SVM_RPC = process.env.SVM_RPC || "http://svm-node:8899";
const TREASURY_KEYPAIR = process.env.TREASURY_KEYPAIR || "/data/treasury.json";
const STATE_PATH = process.env.STATE_PATH || "/data/relayer-state.json";
const POLL_SECONDS = Math.max(5, Number(process.env.POLL_SECONDS || 15));
const DEPOSIT_LOG = /^Program log: shh-bridge:deposit\|(\d+)\|([1-9A-HJ-NP-Za-km-z]+)\|(\d+)$/;

function required(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`[relayer] missing required env ${name}`);
    process.exit(1);
  }
  return v;
}

function loadState() {
  if (existsSync(STATE_PATH)) return JSON.parse(readFileSync(STATE_PATH, "utf8"));
  return { lastSignature: null, credited: {} };
}

function saveState(state) {
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

const l1 = new Connection(L1_RPC, "confirmed");
const l2 = new Connection(SVM_RPC, "confirmed");
const treasury = loadOrCreateKeypair(TREASURY_KEYPAIR);
const state = loadState();

console.log(`[relayer] bridge program ${PROGRAM_ID.toBase58()} on ${L1_RPC}`);
console.log(`[relayer] crediting on ${SVM_RPC} from treasury ${treasury.publicKey.toBase58()}`);

// The devnet L2 faucet is unlimited, so the treasury can top itself up. On a chain without a
// faucet this is where a bridge mint authority takes over (phase 2).
async function ensureTreasury(lamports) {
  const bal = await l2.getBalance(treasury.publicKey);
  if (bal >= lamports + SOL / 100) return;
  const top = Math.max(lamports + SOL, 10 * SOL);
  console.log(`[relayer] treasury low (${bal}) — requesting L2 airdrop of ${top}`);
  const sig = await l2.requestAirdrop(treasury.publicKey, top);
  await l2.confirmTransaction(sig, "confirmed");
}

async function credit(nonce, recipient, lamports, l1Signature) {
  await ensureTreasury(lamports);
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: treasury.publicKey,
      toPubkey: new PublicKey(recipient),
      lamports,
    }),
  );
  const sig = await sendAndConfirmTransaction(l2, tx, [treasury]);
  state.credited[nonce] = { l1Signature, l2Signature: sig, recipient, lamports };
  saveState(state);
  console.log(`[relayer] deposit ${nonce}: credited ${lamports} lamports to ${recipient} (${sig})`);
}

async function tick() {
  // Newest-first page of signatures since our cursor; replay oldest-first.
  const sigs = await l1.getSignaturesForAddress(
    PROGRAM_ID,
    state.lastSignature ? { until: state.lastSignature } : { limit: 50 },
    "confirmed",
  );
  for (const info of sigs.reverse()) {
    if (!info.err) {
      const tx = await l1.getTransaction(info.signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
      for (const line of tx?.meta?.logMessages ?? []) {
        const m = line.match(DEPOSIT_LOG);
        if (!m) continue;
        const [, nonce, recipient, lamports] = m;
        if (state.credited[nonce]) {
          console.log(`[relayer] deposit ${nonce} already credited, skipping`);
          continue;
        }
        await credit(nonce, recipient, Number(lamports), info.signature);
      }
    }
    state.lastSignature = info.signature;
    saveState(state);
  }
}

for (;;) {
  try {
    await tick();
  } catch (e) {
    console.error(`[relayer] tick failed: ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, POLL_SECONDS * 1000));
}
