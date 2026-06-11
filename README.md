<div align="center">

<img src="banner.png" alt="shh" width="640" />

# shh

**An open-source, multichain privacy layer.**

CA : 5BDdn2QaKBpRvLgHwFHRkCK11V499eChVq3j9zL5pump

[𝕏 @privashhgg](https://x.com/privashhgg) · [shh.gg](https://shh.gg)

</div>

**shh** is an open-source, multichain privacy layer: one zero-knowledge core (Circom +
Groth16 on BN254), deployed across execution layers. Live today as an **EVM L3 settling to
Base**; an **SVM layer settling to Solana** is underway on the same core.

**EVM track — privacy L3 on Base (OP Stack).** Ships in two profiles that share the
cryptographic core:

- **Full privacy chain** — every transfer is a shielded UTXO note (Circom + Groth16).
- **Open L3 + Privacy Pool** — a transparent EVM L3 with an opt-in, _compliance-compatible_
  Privacy Pool (fixed denomination + Association Sets, so withdrawals are "unlockable" by an
  Association Set Provider).

It runs locally with a single sequencer via Docker Compose, and is **live as a public testnet
L3 settling to Base Sepolia** — see [Live testnet](#live-testnet).

**SVM track — privacy layer on Solana.** The same BN254 circuits verify on Solana via the
`alt_bn128` syscalls. Today: a single-node SVM devnet with native confidential transfers
(Token-2022), ledger anchoring to Solana devnet, and a Solana L1 bridge vault for deposits —
see [`infra/svm-l2`](infra/svm-l2) and [`packages/svm-bridge`](packages/svm-bridge).

## Layout

```
packages/
  circuits/   Circom circuits + trusted-setup tooling (the zk core)
  contracts/  Hardhat: pools, Poseidon Merkle tree, bridges, generated verifiers
  sdk/        TypeScript: notes, Merkle tree, witness + proof generation (npm: @privashh/sdk)
  asp-publisher/  daemon: publishes the Privacy Pool association-set root on-chain
  svm-bridge/ Solana L1 bridge vault program + deposit relayer (SVM profile)
infra/
  op-stack/   Docker Compose single-sequencer L3 (live; settles to Base Sepolia)
  svm-l2/     Docker Compose single-node SVM devnet (SVM privacy-layer profile; anchors to Solana devnet)
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

Real chains + explorer (Docker; chain boot is optional — see each README):

```bash
cd infra/op-stack && cp .env.example .env && make generate && docker compose up -d
cd infra/explorer && cp .env.example .env && docker compose up -d
cd infra/svm-l2   && cp .env.example .env && make up        # SVM devnet anchored to Solana
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
| PrivacyPool | `0x06f7F1539030D116AecCC7a32eF35D71b572dc3c` |
| ShieldedPool | `0xFf0186cb30cF970F1911760e2fc2b37ED5114520` |
| AssociationSetProvider | `0x37C5550c8baF1015f0a469b7C4d6D63065965aeF` |
| PoolWithdrawVerifier | `0xc3A5f03b0b1BeD88A50BadAf0C83b9c04f5ede56` |
| Transaction2x2Verifier | `0xc26C4e92f2c48dC9dC45e02e81092c15f3caC25e` |
| Poseidon hasher | `0x17071fFB640DB06aE3568050a9E0217c51899e64` |

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
