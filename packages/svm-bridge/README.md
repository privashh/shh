# shh SVM bridge

The L1 (Solana) side of the shh SVM L2 — the program that gets deployed to Solana so funds
can move into the L2 at all. SOL only in phase 1.

How a deposit flows:

1. The user calls `Deposit` on L1: SOL moves into the program's vault PDA, the instruction
   names an L2 recipient.
2. The program appends a numbered entry to the deposit log:
   `shh-bridge:deposit|<nonce>|<l2 recipient>|<lamports>`.
3. The relayer (`client/relayer.mjs`) follows the log and credits the same amount on the L2.
   The nonce makes crediting idempotent.

Withdrawals exist as `Withdraw` — release from the vault signed by the operator key set at
initialize.

## Trust model — read before anything touches mainnet

Deposited funds sit in a PDA vault (no single key can move them except through the program),
but in phase 1 the *rules* are operator-shaped: L2 credits come from a relayer treasury and
withdrawals are released by the operator key. That is an early-rollup bridge, not a trustless
one. Phase 2 replaces the operator with proofs: withdrawals verified against the L2 state
commitments (Groth16 on BN254 via the `alt_bn128` syscalls — the same core as
`packages/circuits`), and the settler's anchors become the commitments being proven against.
Until then this bridge must not hold real funds — the same policy as `SECURITY.md`.

## Build and deploy (devnet first)

```bash
pnpm --filter @shh/svm-bridge build:program   # cargo build-sbf (ships with the agave release)
solana program deploy program/target/deploy/shh_bridge.so --url devnet
node client/initialize.mjs --program <PROGRAM_ID>   # one-time: config + vault PDAs, operator = payer
```

The same `.so` deploys to mainnet-beta unchanged (`--url mainnet-beta`, deploy rent costs a
few SOL) — but see the trust model above for why that waits for phase 2 plus an audit.

## Use

```bash
node client/deposit.mjs  --program <ID> --amount-sol 0.5 --l2-recipient <L2_PUBKEY>
node client/withdraw.mjs --program <ID> --amount-sol 0.5 --recipient <L1_PUBKEY>   # operator key
```

## Relayer

| env | default | meaning |
| --- | --- | --- |
| `BRIDGE_PROGRAM_ID` | required | the deployed program |
| `L1_RPC` | `https://api.devnet.solana.com` | where the program lives |
| `SVM_RPC` | `http://svm-node:8899` | the L2 being credited |
| `TREASURY_KEYPAIR` | `/data/treasury.json` | L2 funds source, created on boot |
| `STATE_PATH` | `/data/relayer-state.json` | processed deposits + cursor |
| `POLL_SECONDS` | `15` | poll interval |

It runs as the `bridge-relayer` service in `infra/svm-l2` (compose profile `bridge`):

```bash
cd ../../infra/svm-l2
echo "BRIDGE_PROGRAM_ID=<PROGRAM_ID>" >> .env
docker compose --profile bridge up -d --build
```
