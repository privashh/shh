// Shared helpers for the shh bridge clients: keypair loading, PDA derivation, instruction
// builders matching program/src/lib.rs (1-byte tag + little-endian fields).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
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

export function ixInitialize({ programId, payer, operator }) {
  const { config, vault } = pdas(programId);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: config, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: operator, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([0]),
  });
}

export function ixDeposit({ programId, depositor, amountLamports, l2Recipient }) {
  const { config, vault } = pdas(programId);
  const data = Buffer.alloc(41);
  data[0] = 1;
  data.writeBigUInt64LE(BigInt(amountLamports), 1);
  l2Recipient.toBuffer().copy(data, 9);
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
  const data = Buffer.alloc(9);
  data[0] = 2;
  data.writeBigUInt64LE(BigInt(amountLamports), 1);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: operator, isSigner: true, isWritable: false },
      { pubkey: config, isSigner: false, isWritable: false },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: recipient, isSigner: false, isWritable: true },
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
