<div align="center">

<img src="banner.png" alt="shh" width="640" />

# shh

**A privacy L3 on Base, built on the OP Stack.**

[𝕏 @privashh](https://x.com/privashh) · [shh.gg](https://shh.gg)

</div>

A **privacy L3 on Base**, built on the OP Stack. shh ships in two profiles that share one
cryptographic core:

- **Full privacy chain** — every transfer is a shielded UTXO note (Circom + Groth16).
- **Open L3 + Privacy Pool** — a transparent EVM L3 with an opt-in, _compliance-compatible_
  Privacy Pool (fixed denomination + Association Sets, so withdrawals are "unlockable" by an
  Association Set Provider).

It runs locally with a single sequencer via Docker Compose and deploys to Base Sepolia /
mainnet by swapping the settlement endpoint and keys.

## Layout

```
packages/
  circuits/   Circom circuits + trusted-setup tooling (the zk core)
  contracts/  Hardhat: pools, Poseidon Merkle tree, bridges, generated verifiers
  sdk/        TypeScript: notes, Merkle tree, witness + proof generation
infra/
  op-stack/   Docker Compose single-sequencer L3 devnet
  explorer/   Blockscout
apps/
  web/        Next.js UI (deposit / shielded transfer / withdraw)
docs/
  workflow.md          phased build plan + verification gates
  architecture.md      system architecture
  privacy-design.md    cryptographic source of truth (hashes, circuits, signals)
```

## Quick start

```bash
pnpm install
pnpm setup        # compile circuits + Groth16 trusted setup + build sdk & contracts
pnpm dev          # local chain + deploy + copy artifacts + wallet backend (http://localhost:3000)
```

`pnpm dev` is the turn-key local stack: it starts a local node, deploys the privacy core,
copies circuit artifacts into the web app, and runs the wallet backend. Then:

```bash
node apps/web/scripts/demo-deposit.mjs          # make a Privacy Pool deposit
curl http://localhost:3000/api/pool/leaves      # see it indexed
```

Run the full verification gate directly:

```bash
pnpm --filter @shh/sdk test       # 9/9  notes, Merkle, value conservation
pnpm --filter @shh/circuits test  # 4/4  valid witness proves+verifies; tampered fails
pnpm contracts:test               # 10/10 deposit→prove→withdraw, double-spend, ASP gating,
                                  #       bidirectional shielded bridge, front-running
```

Real L3 + explorer (Docker; chain boot is optional — see each README):

```bash
cd infra/op-stack && cp .env.example .env && make generate && docker compose up -d
cd infra/explorer && cp .env.example .env && docker compose up -d
```

> Status: privacy core **done & verified**; full stack scaffolded & turn-key. See
> [docs/workflow.md](docs/workflow.md).

## Security

The trusted setup shipped for development is single-contributor and **must not** secure real
funds. Mainnet requires a multi-party ceremony and an external audit (Phase 8). See
[docs/privacy-design.md](docs/privacy-design.md).
