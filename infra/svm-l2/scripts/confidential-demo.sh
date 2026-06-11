#!/usr/bin/env sh
# Privacy demo: Token-2022 confidential transfers on the shh SVM devnet.
# Mirrors the canonical token-2022 CLI example (clients/cli/examples/confidential-transfer.sh):
# one payer wallet, a confidential mint, two token accounts — the transferred AMOUNT is
# encrypted on-chain (twisted ElGamal + the ZK ElGamal proof program).
# Runs INSIDE the svm-node container (make demo).
set -eu

URL="${URL:-http://127.0.0.1:8899}"
T22=TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb
PAYER=/tmp/ct-payer.json
MINT_KP=/tmp/ct-mint.json
SRC_KP=/tmp/ct-source.json
DST_KP=/tmp/ct-destination.json

say() { printf '\n== %s ==\n' "$1"; }

say "payer + account keypairs + airdrop"
solana-keygen new --no-bip39-passphrase --silent --force -o "$PAYER"
solana-keygen new --no-bip39-passphrase --silent --force -o "$MINT_KP"
solana-keygen new --no-bip39-passphrase --silent --force -o "$SRC_KP"
solana-keygen new --no-bip39-passphrase --silent --force -o "$DST_KP"
solana config set --url "$URL" --keypair "$PAYER" >/dev/null
solana airdrop 100 >/dev/null
MINT=$(solana-keygen pubkey "$MINT_KP")
SRC=$(solana-keygen pubkey "$SRC_KP")
DST=$(solana-keygen pubkey "$DST_KP")
echo "mint: $MINT"
echo "source token account: $SRC"
echo "destination token account: $DST"

say "create a Token-2022 mint with confidential transfers enabled"
spl-token --program-id "$T22" create-token "$MINT_KP" --enable-confidential-transfers auto

say "create + configure both token accounts, mint 100 public tokens to source"
spl-token create-account "$MINT" "$SRC_KP"
spl-token configure-confidential-transfer-account --address "$SRC"
spl-token create-account "$MINT" "$DST_KP"
spl-token configure-confidential-transfer-account --address "$DST"
spl-token mint "$MINT" 100 "$SRC"

say "shield: deposit 100 into the confidential balance, apply pending"
spl-token deposit-confidential-tokens "$MINT" 100 --address "$SRC"
spl-token apply-pending-balance --address "$SRC"

say "confidential transfer of 10 (amount encrypted on-chain)"
spl-token transfer "$MINT" 10 "$DST" --from "$SRC" --confidential
spl-token apply-pending-balance --address "$DST"

say "what the chain stores for the destination account (ciphertexts, not amounts)"
spl-token display "$DST"

echo
echo "OK: confidential transfer completed - on-chain amounts are ElGamal ciphertexts."
