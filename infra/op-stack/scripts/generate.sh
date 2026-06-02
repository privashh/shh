#!/usr/bin/env bash
# Generate the shh L3 genesis + rollup config and deploy its L1 (Base) contracts using
# op-deployer (the OP Stack deployment tool), then emit the files docker-compose expects.
#
# Prereq: Docker, and a funded GS_ADMIN_PRIVATE_KEY on the L1 (Base) endpoint.
# Booting is intentionally out of scope here — see README.md.
set -euo pipefail

cd "$(dirname "$0")/.."
[ -f .env ] && set -a && . ./.env && set +a

CONFIGS=./configs
WORKDIR=./.deployer
DEPLOYER_IMAGE=us-docker.pkg.dev/oplabs-tools-artifacts/images/op-deployer:${OP_DEPLOYER_TAG:-v0.6.0}
mkdir -p "$CONFIGS" "$WORKDIR"

run_deployer() {
  docker run --rm -v "$PWD/$WORKDIR:/work" -w /work "$DEPLOYER_IMAGE" "$@"
}

echo "▶ init intent (L1=$L1_CHAIN_ID, L2=$L2_CHAIN_ID)"
run_deployer init --l1-chain-id "$L1_CHAIN_ID" --l2-chain-ids "$L2_CHAIN_ID" --workdir /work

echo "▶ apply (deploy L1 contracts onto Base)"
run_deployer apply --workdir /work --l1-rpc-url "$L1_RPC" --private-key "${GS_ADMIN_PRIVATE_KEY#0x}"

echo "▶ inspect genesis + rollup"
run_deployer inspect genesis --workdir /work "$L2_CHAIN_ID" > "$CONFIGS/genesis.json"
run_deployer inspect rollup  --workdir /work "$L2_CHAIN_ID" > "$CONFIGS/rollup.json"

echo "▶ jwt secret"
openssl rand -hex 32 > "$CONFIGS/jwt.txt"

echo "✓ wrote $CONFIGS/{genesis.json,rollup.json,jwt.txt}"
echo "  Next: read the DisputeGameFactory address from $WORKDIR/state.json into DGF_ADDRESS in .env,"
echo "        then: docker compose up -d"
