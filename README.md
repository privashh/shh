<div align="center">

<img src="banner.png" alt="shh" width="640" />

# shh

**A privacy L3 on Base, built on the OP Stack.**

[𝕏 @privashhgg](https://x.com/privashhgg) · [shh.gg](https://shh.gg)

</div>

A **privacy L3 on Base**, built on the OP Stack. shh ships in two profiles that share one
cryptographic core:

- **Full privacy chain** — every transfer is a shielded UTXO note (Circom + Groth16).
- **Open L3 + Privacy Pool** — a transparent EVM L3 with an opt-in, _compliance-compatible_
  Privacy Pool (fixed denomination + Association Sets, so withdrawals are "unlockable" by an
  Association Set Provider).

It runs locally with a single sequencer via Docker Compose, and is **live as a public testnet
L3 settling to Base Sepolia** — see [Live testnet](#live-testnet).

## Layout

```
packages/
  circuits/   Circom circuits + trusted-setup tooling (the zk core)
  contracts/  Hardhat: pools, Poseidon Merkle tree, bridges, generated verifiers
  sdk/        TypeScript: notes, Merkle tree, witness + proof generation (npm: @privashh/sdk)
  asp-publisher/  daemon: publishes the Privacy Pool association-set root on-chain
infra/
  op-stack/   Docker Compose single-sequencer L3 (live; settles to Base Sepolia)
  explorer/   Blockscout
apps/
  web/        Next.js wallet backend (route handlers; local dev)
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
pnpm --filter @privashh/sdk test       # 9/9  notes, Merkle, value conservation
pnpm --filter @shh/circuits test  # 4/4  valid witness proves+verifies; tampered fails
pnpm contracts:test               # 10/10 deposit→prove→withdraw, double-spend, ASP gating,
                                  #       bidirectional shielded bridge, front-running
```

Real L3 + explorer (Docker; chain boot is optional — see each README):

```bash
cd infra/op-stack && cp .env.example .env && make generate && docker compose up -d
cd infra/explorer && cp .env.example .env && docker compose up -d
```

> Status: **live on a public testnet** — the L3, privacy core, ASP publisher, and public RPC are
> up, and the client SDK is published to npm. The wallet UI (in-browser proving) is in progress.
> See [docs/workflow.md](docs/workflow.md).

## Live testnet

shh runs as a public OP Stack L3 settling to **Base Sepolia**.

| | |
| --- | --- |
| Chain ID | `55666` |
| RPC | `https://rpc.shh.gg` |
| Settlement (L1) | Base Sepolia (`84532`) |
| Profile | open-pool (transparent L3 + Privacy Pool) |
| Pool denomination | 0.1 ETH |

**Deployed contracts** (open-pool profile):

| Contract | Address |
| --- | --- |
| PrivacyPool | `0x611Eb371557F7db14b843be44C086eB0aF6a9ebf` |
| ShieldedPool | `0x4d306a129C5aA56Eb3F164581944A7186c8630Fb` |
| AssociationSetProvider | `0x8C984B0Ae4783dc333D5A2A2D15108b488DDa2B5` |
| PoolWithdrawVerifier | `0x5ec1Ba4901C11Cd6096A262c8934ab3f1F044FBc` |
| Transaction2x2Verifier | `0xDD552646af0065C92C65041b99AaE2aef2261Fb5` |
| Poseidon hasher | `0xCB8f37dA7b28a98f19F70285b76603Fac8cEacaD` |

An ASP publisher keeps the association-set root current on-chain, so deposits become
withdrawable. The client SDK is published as
[`@privashh/sdk`](https://www.npmjs.com/package/@privashh/sdk):

```bash
npm install @privashh/sdk
```

## Security

The trusted setup shipped for development is single-contributor and **must not** secure real
funds. Mainnet requires a multi-party ceremony and an external audit (Phase 8). See
[docs/privacy-design.md](docs/privacy-design.md).
