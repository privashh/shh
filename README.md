# shh

A **privacy L3 on Base**, built on the OP Stack.

- **Full privacy chain** — every transfer is a shielded UTXO note (Circom + Groth16).
- **Open L3 + Privacy Pool** — a transparent EVM L3 with an opt-in, compliance-compatible
  Privacy Pool (fixed denomination + Association Sets).

## Layout

```
packages/
  circuits/   Circom circuits + trusted-setup tooling
  contracts/  Hardhat: pools, Merkle tree, bridges, verifiers
  sdk/        TypeScript: notes, Merkle tree, witness + proof generation
apps/
  web/        Next.js UI
docs/
  workflow.md, architecture.md
```

## Quick start

```bash
pnpm install
```

> Status: early scaffolding. See [docs/workflow.md](docs/workflow.md).
