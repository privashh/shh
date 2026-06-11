// Shared helpers for the shh bridge clients. The on-chain program is an Anchor program, so
// instruction data = 8-byte discriminator (sha256("global:<ix>")[..8]) ++ borsh(args), and
// account order/flags match the program's #[derive(Accounts)] structs. Verified against the
// published IDL (idl/shh_bridge.json).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { Keypair, PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";

export const DEFAULT_KEYPAIR = join(homedir(), ".config", "solana", "id.json");

export function loadKeypair(path) {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))));
}

export function loadOrCreateKeypair(path) {
  if (existsSync(path)) return loadKeypair(path);
  const kp = Keypair.generate();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify([...kp.secretKey]));
  return kp;
}

export function pdas(programId) {
  const [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], programId);
  const [vault] = PublicKey.findProgramAddressSync([Buffer.from("vault")], programId);
  return { config, vault };
}

// Anchor instruction discriminator: first 8 bytes of sha256("global:<name>").
function disc(name) {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

function u64le(n) {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n));
  return b;
}

export function ixInitialize({ programId, payer, operator }) {
  const { config, vault } = pdas(programId);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: config, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: false },
      { pubkey: operator, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: disc("initialize"),
  });
}

export function ixDeposit({ programId, depositor, amountLamports, l2Recipient }) {
  const { config, vault } = pdas(programId);
  const data = Buffer.concat([disc("deposit"), u64le(amountLamports), l2Recipient.toBuffer()]);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: depositor, isSigner: true, isWritable: true },
      { pubkey: config, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function ixWithdraw({ programId, operator, amountLamports, recipient }) {
  const { config, vault } = pdas(programId);
  const data = Buffer.concat([disc("withdraw"), u64le(amountLamports)]);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: operator, isSigner: true, isWritable: false },
      { pubkey: config, isSigner: false, isWritable: false },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: recipient, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1] !== undefined) return process.argv[i + 1];
  if (fallback !== undefined) return fallback;
  console.error(`missing required --${name}`);
  process.exit(1);
}

export const SOL = 1_000_000_000;
