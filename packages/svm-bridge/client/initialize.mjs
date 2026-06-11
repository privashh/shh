// One-time setup after `solana program deploy`: creates the config + vault PDAs and sets the
// operator (defaults to the payer). Run once per deployment.
//
//   node client/initialize.mjs --program <PROGRAM_ID> [--url <RPC>] [--keypair <path>] [--operator <pubkey>]

import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { DEFAULT_KEYPAIR, arg, ixInitialize, loadKeypair, pdas } from "./lib.mjs";

const programId = new PublicKey(arg("program"));
const url = arg("url", "https://api.devnet.solana.com");
const payer = loadKeypair(arg("keypair", DEFAULT_KEYPAIR));
const operator = new PublicKey(arg("operator", payer.publicKey.toBase58()));

const connection = new Connection(url, "confirmed");
const { config, vault } = pdas(programId);
console.log(`program:  ${programId.toBase58()}`);
console.log(`config:   ${config.toBase58()}`);
console.log(`vault:    ${vault.toBase58()}`);
console.log(`operator: ${operator.toBase58()}`);

const tx = new Transaction().add(ixInitialize({ programId, payer: payer.publicKey, operator }));
const sig = await sendAndConfirmTransaction(connection, tx, [payer]);
console.log(`initialized: ${sig}`);
