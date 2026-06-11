#!/usr/bin/env sh
# Verification gate: "programs can be deployed to this chain."
# Runs INSIDE the svm-node container (make verify): fresh key -> faucet airdrop -> deploy a
# real BPF program -> read it back. The sample binary is dumped from the chain's own preloaded
# Memo program, so the check is fully self-contained (no internet, no toolchain).
set -eu

URL="${URL:-http://127.0.0.1:8899}"
KEY=/tmp/verify-deployer.json
SO=/tmp/sample-program.so

echo "== cluster =="
solana cluster-version --url "$URL"
solana genesis-hash --url "$URL"

echo "== deployer key + airdrop =="
solana-keygen new --no-bip39-passphrase --silent --force -o "$KEY"
solana airdrop 100 --url "$URL" -k "$KEY" >/dev/null
echo "balance: $(solana balance --url "$URL" -k "$KEY")"

echo "== dump a sample program from this chain =="
solana program dump MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr "$SO" --url "$URL"
ls -la "$SO"

echo "== deploy it under a fresh program id =="
OUT=$(solana program deploy "$SO" --url "$URL" -k "$KEY")
echo "$OUT"
PID=$(printf '%s\n' "$OUT" | awk '/Program Id:/ {print $3}')

echo "== read it back =="
solana program show "$PID" --url "$URL"

echo "OK: program deployed and visible at $PID"
