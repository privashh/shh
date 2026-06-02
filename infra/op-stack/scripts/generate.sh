#!/usr/bin/env bash
# Deploy the shh L3's OP Stack contracts onto Base and emit the files docker-compose.yml needs:
# genesis.json, rollup.json, l1-chain-config.json, jwt.txt — and record DGF_ADDRESS into .env.
#
# Base Sepolia has no pre-deployed OPCM, so we use op-deployer's *custom* intent (deploys the
# implementation contracts too) and fill the chain roles from the GS_* keys in .env.
#
# Prereqs: Docker, foundry (cast), jq, openssl; a funded GS_ADMIN_PRIVATE_KEY on L1_RPC; .env filled.
# Booting is `docker compose up -d` (see README.md).
set -euo pipefail

cd "$(dirname "$0")/.."
[ -f .env ] && set -a && . ./.env && set +a
export PATH="$HOME/.foundry/bin:$PATH"

CONFIGS=./configs
WORKDIR=./.deployer
DEPLOYER_IMAGE="us-docker.pkg.dev/oplabs-tools-artifacts/images/op-deployer:${OP_DEPLOYER_TAG:-v0.6.0}"
mkdir -p "$CONFIGS" "$WORKDIR"

if [ -f "$CONFIGS/genesis.json" ]; then
  echo "configs/genesis.json already exists — the chain is already deployed."
  echo "Redeploying spends L1 gas and changes all addresses. To start over: make reset, then re-run."
  exit 0
fi

command -v cast >/dev/null || { echo "cast (foundry) not found in PATH"; exit 1; }
command -v jq   >/dev/null || { echo "jq not found"; exit 1; }

run_deployer() { sudo docker run --rm -v "$PWD/$WORKDIR:/work" "$DEPLOYER_IMAGE" op-deployer "$@"; }

# Chain role addresses, derived from the GS_* private keys.
ADMIN=$(cast wallet address "$GS_ADMIN_PRIVATE_KEY")
SEQ=$(cast wallet address "$GS_SEQUENCER_PRIVATE_KEY")
BATCHER=$(cast wallet address "$GS_BATCHER_PRIVATE_KEY")
PROPOSER=$(cast wallet address "$GS_PROPOSER_PRIVATE_KEY")
echo "roles: admin=$ADMIN sequencer=$SEQ batcher=$BATCHER proposer=$PROPOSER"

echo "▶ init intent (custom — Base has no pre-deployed OPCM, so implementations are deployed too)"
run_deployer init --l1-chain-id "$L1_CHAIN_ID" --l2-chain-ids "$L2_CHAIN_ID" \
  --workdir /work --intent-type custom

I="$WORKDIR/intent.toml"
# Fill role addresses (admin owns everything; sequencer signs blocks; batcher/proposer post to L1).
sudo sed -i \
  -e "s|SuperchainProxyAdminOwner = .*|SuperchainProxyAdminOwner = \"$ADMIN\"|" \
  -e "s|SuperchainGuardian = .*|SuperchainGuardian = \"$ADMIN\"|" \
  -e "s|ProtocolVersionsOwner = .*|ProtocolVersionsOwner = \"$ADMIN\"|" \
  -e "s|Challenger = .*|Challenger = \"$ADMIN\"|" \
  -e "s|challenger = .*|challenger = \"$ADMIN\"|" \
  -e "s|baseFeeVaultRecipient = .*|baseFeeVaultRecipient = \"$ADMIN\"|" \
  -e "s|l1FeeVaultRecipient = .*|l1FeeVaultRecipient = \"$ADMIN\"|" \
  -e "s|sequencerFeeVaultRecipient = .*|sequencerFeeVaultRecipient = \"$ADMIN\"|" \
  -e "s|operatorFeeVaultRecipient = .*|operatorFeeVaultRecipient = \"$ADMIN\"|" \
  -e "s|chainFeesRecipient = .*|chainFeesRecipient = \"$ADMIN\"|" \
  -e "s|l1ProxyAdminOwner = .*|l1ProxyAdminOwner = \"$ADMIN\"|" \
  -e "s|l2ProxyAdminOwner = .*|l2ProxyAdminOwner = \"$ADMIN\"|" \
  -e "s|systemConfigOwner = .*|systemConfigOwner = \"$ADMIN\"|" \
  -e "s|unsafeBlockSigner = .*|unsafeBlockSigner = \"$SEQ\"|" \
  -e "s|batcher = .*|batcher = \"$BATCHER\"|" \
  -e "s|proposer = .*|proposer = \"$PROPOSER\"|" \
  "$I"
# Standard OP EIP-1559 params (the custom intent leaves these 0).
sudo sed -i \
  -e "s|^  eip1559DenominatorCanyon = .*|  eip1559DenominatorCanyon = 250|" \
  -e "s|^  eip1559Denominator = .*|  eip1559Denominator = 50|" \
  -e "s|^  eip1559Elasticity = .*|  eip1559Elasticity = 6|" \
  "$I"
# ETH-based chain → remove the customGasToken section (else apply requires a token name).
sudo sed -i '/\[chains.customGasToken\]/,$d' "$I"

echo "▶ apply (deploy OP Stack contracts onto L1 chain $L1_CHAIN_ID via $L1_RPC)"
run_deployer apply --workdir /work --l1-rpc-url "$L1_RPC" --private-key "${GS_ADMIN_PRIVATE_KEY#0x}"

echo "▶ inspect genesis + rollup"
run_deployer inspect genesis --workdir /work "$L2_CHAIN_ID" > "$CONFIGS/genesis.json"
run_deployer inspect rollup  --workdir /work "$L2_CHAIN_ID" > "$CONFIGS/rollup.json"

# op-node needs the L1 chain config because Base isn't a built-in L1 for it. op-node only
# follows recent (post-Dencun) L1 blocks and reads the base fee from headers, so all forks
# active at genesis + the Cancun blob schedule is sufficient.
echo "▶ L1 chain config (Base Sepolia, for op-node --rollup.l1-chain-config)"
cat > "$CONFIGS/l1-chain-config.json" <<JSON
{
  "config": {
    "chainId": $L1_CHAIN_ID,
    "homesteadBlock": 0, "eip150Block": 0, "eip155Block": 0, "eip158Block": 0,
    "byzantiumBlock": 0, "constantinopleBlock": 0, "petersburgBlock": 0,
    "istanbulBlock": 0, "berlinBlock": 0, "londonBlock": 0,
    "mergeNetsplitBlock": 0, "shanghaiTime": 0, "cancunTime": 0,
    "terminalTotalDifficulty": 0,
    "blobSchedule": { "cancun": { "target": 3, "max": 6, "baseFeeUpdateFraction": 3338477 } }
  }
}
JSON

echo "▶ jwt secret"
openssl rand -hex 32 > "$CONFIGS/jwt.txt"

echo "▶ record DisputeGameFactory address into .env"
DGF=$(jq -r '.opChainDeployments[0] | to_entries[]
  | select(.key | test("^disputeGameFactoryProxy$"; "i")) | .value' "$WORKDIR/state.json")
if [ -n "${DGF:-}" ] && [ "$DGF" != "null" ] && [ -f .env ]; then
  if grep -q '^DGF_ADDRESS=' .env; then
    sed -i "s|^DGF_ADDRESS=.*|DGF_ADDRESS=$DGF|" .env
  else
    echo "DGF_ADDRESS=$DGF" >> .env
  fi
fi

echo "✓ wrote $CONFIGS/{genesis.json,rollup.json,l1-chain-config.json,jwt.txt}"
echo "  DGF_ADDRESS=$DGF"
echo "  Next: docker compose up -d   then   cast block latest --rpc-url http://localhost:9545"
