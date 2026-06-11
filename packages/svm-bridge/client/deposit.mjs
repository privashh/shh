// Deposit SOL on L1 into the bridge vault, naming the L2 account that should be credited.
// The relayer sees the deposit log and credits the same amount on the L2.
//
//   node client/deposit.mjs --program <PROGRAM_ID> --amount-sol <SOL> --l2-recipient <pubkey> \
//     [--url <RPC>] [--keypair <path>]

import { Connection, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { DEFAULT_KEYPAIR, SOL, arg, ixDeposit, loadKeypair } from "./lib.mjs";

const programId = new PublicKey(arg("program"));
const url = arg("url", "https://api.devnet.solana.com");
const payer = loadKeypair(arg("keypair", DEFAULT_KEYPAIR));
const amountLamports = Math.round(Number(arg("amount-sol")) * SOL);
const l2Recipient = new PublicKey(arg("l2-recipient"));

const connection = new Connection(url, "confirmed");
const tx = new Transaction().add(
  ixDeposit({ programId, depositor: payer.publicKey, amountLamports, l2Recipient }),
);
const sig = await sendAndConfirmTransaction(connection, tx, [payer]);
console.log(`deposited ${amountLamports} lamports for L2 ${l2Recipient.toBase58()}: ${sig}`);
