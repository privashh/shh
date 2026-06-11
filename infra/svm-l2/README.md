# shh SVM devnet

The SVM-based privacy-layer profile of shh: a single-node Solana (agave) chain you own,
anchored to Solana devnet, with program deploys enabled from day one. It is the execution
layer the Groth16 shielded pool will land on — the BN254 circuits in `packages/circuits`
verify on SVM through the `alt_bn128` syscalls, so the EVM and SVM profiles share one
cryptographic core.

What you get in phase 1:

| Component | Role |
| --- | --- |
| `svm-node` | agave test validator: sequencer + RPC (`:8899`) + faucet, SPL programs preloaded, all runtime features active |
| `settler` | anchors the L2 ledger tip (slot + blockhash) to Solana devnet as Memo txs — the SVM twin of op-proposer |
| `bridge-relayer` (opt-in) | credits L1 bridge deposits on the L2 — needs `packages/svm-bridge` deployed on the settlement chain |
| confidential transfers | Token-2022 confidential transfers work natively today: amounts are ElGamal ciphertexts on-chain |

## Quick start

```bash
cp .env.example .env
make up          # or: docker compose up -d --build
make verify      # gate: deploys a real BPF program against the chain, reads it back
make demo        # confidential transfer between two parties, amount encrypted on-chain
make logs        # watch the node + settler (anchor txs land on devnet)
```

## Deploying your own programs

The RPC is published on loopback (`127.0.0.1:8899`), so the standard toolchain just works:

```bash
solana config set --url http://127.0.0.1:8899
solana airdrop 10
solana program deploy target/deploy/your_program.so
```

Anything built with `cargo build-sbf` (or Anchor) deploys unchanged.

## The settler

On first boot the settler generates `anchor-keypair.json` (in the `settler-data` volume,
solana-keygen-compatible) and tries a devnet airdrop. Devnet faucets rate-limit hard; if the
log says it is broke, fund the printed address at <https://faucet.solana.com> once and the
loop recovers. Each anchor is a Memo on devnet: `shh-svm|v0|slot=...|blockhash=...`.

## Bridge — getting funds in from L1

Deploy [`packages/svm-bridge`](../../packages/svm-bridge) to the settlement chain (devnet),
then point the relayer at it:

```bash
echo "BRIDGE_PROGRAM_ID=<PROGRAM_ID>" >> .env
docker compose --profile bridge up -d --build
```

L1 deposits (`client/deposit.mjs`) are credited 1:1 on the L2. Phase 1 trust model is
operator-shaped — see the bridge README before pointing it at anything but devnet.

## Phase map

Phase 1 (this stack) is a devnet with native confidential amounts and an anchoring heartbeat.
The path to the full privacy layer, mirroring `docs/privacy-design.md`:

1. Shielded pool program — port the pool to a native SVM program: Poseidon commitment tree
   (`light-poseidon` matches circomlib), nullifier PDAs, Groth16 verification via
   `groth16-solana` against the existing `packages/circuits` verification keys.
2. Real settlement — replace ledger-tip memos with state commitments (commitment root +
   nullifier root) and batch data, posted by the settler; gate bridge withdrawals on proofs
   against those commitments; add the force-exit path on L1.
3. Public RPC — Caddy TLS proxy (`svm-rpc.<domain>`), same pattern as `infra/op-stack`.
4. Multi-node — swap the test validator for `agave-validator` with a real genesis once there
   is more than one operator.

## Reset

```bash
make reset       # docker compose down -v — wipes ledger and settler key
```
