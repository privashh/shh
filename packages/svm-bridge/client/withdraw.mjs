// Operator-signed release from the L1 vault (phase 1 trust model — see README). The keypair
// must be the operator set at initialize.
//
//   node client/withdraw.mjs --program <PROGRAM_ID> --amount-sol <SOL> --recipient <pubkey> \
//     [--url <RPC>] [--keypair <path>]

import { Connection, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { DEFAULT_KEYPAIR, SOL, arg, ixWithdraw, loadKeypair } from "./lib.mjs";

const programId = new PublicKey(arg("program"));
const url = arg("url", "https://api.devnet.solana.com");
const operator = loadKeypair(arg("keypair", DEFAULT_KEYPAIR));
const amountLamports = Math.round(Number(arg("amount-sol")) * SOL);
const recipient = new PublicKey(arg("recipient"));

const connection = new Connection(url, "confirmed");
const tx = new Transaction().add(
  ixWithdraw({ programId, operator: operator.publicKey, amountLamports, recipient }),
);
const sig = await sendAndConfirmTransaction(connection, tx, [operator]);
console.log(`withdrew ${amountLamports} lamports to ${recipient.toBase58()}: ${sig}`);
