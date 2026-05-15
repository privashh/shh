# shh — Build Workflow

The master plan for building **shh**, a Base-based Privacy L3 on the OP Stack.
Each phase has concrete **deliverables** and a **verification gate** that must pass
before moving on. The goal is a complete, reproducible, locally-runnable system that
can also be deployed to Base Sepolia / Base mainnet.

> Locked decisions (Phase 0): **Circom + Groth16** proving stack · **UTXO notes +
> fixed-denomination Privacy Pool** value models · **Docker Compose** single-sequencer
> devnet · contracts in **Hardhat (TypeScript)**.

---

## Phase 0 — Foundations & decisions ✅

- [x] Choose proving stack: Circom + Groth16 (snarkjs).
- [x] Choose value models: shielded UTXO (full-privacy chain) + fixed-denomination
      Privacy Pool with Association Sets (compliant variant).
- [x] Choose local orchestration: Docker Compose, single sequencer.
- [x] Choose contract tooling: Hardhat + TypeScript.

**Gate:** decisions recorded in this doc and architecture.md.

---

## Phase 1 — Monorepo scaffold + privacy core ✅

The cryptographic heart of the project, independent of the chain it runs on.

- [x] pnpm monorepo (`packages/*`, `apps/*`) + shared TS config.
- [x] `@shh/circuits` — Circom circuits + Groth16 trusted setup.
- [x] `@shh/contracts` — Hardhat pools, Merkle tree, verifiers.
- [x] `@shh/sdk` — note management, Merkle tree, witness + proof generation.

**Gate:** circuits compile + setup; sdk/circuits/contracts tests pass.

---

## Phase 2 — Local OP Stack devnet (single sequencer) ◐ scaffolded

- [x] `infra/op-stack` docker-compose: L1 + op-geth + op-node + op-batcher + op-proposer.
- [x] Genesis + rollup config generation via op-deployer (`generate.sh` + `generate.ps1`).
- [x] `make generate / up / down / reset` (+ PowerShell on Windows).

**Gate (deferred):** booting blocks is skipped for now; compose is validated.

---

## Phase 3 — Two chain profiles ◐ scaffolded

- [x] Profile selector wired: `SHH_PROFILE=full-privacy|open-pool` in deploy + devnet env,
      recorded in the deployment manifest and surfaced via `/api/config`.
- [ ] Profile A — Full privacy chain (ShieldedPool predeploy).
- [ ] Profile B — Open L3 + Privacy Pool + ASP (app-layer deploy works via `deploy:local`).
- [ ] Per-profile genesis predeploys (needs the booted devnet from Phase 2).

---

## Phase 4 — Bridges ◐ scaffolded

- [x] ShieldedBridge bidirectional (deposit + withdrawal). Both unit-tested.
- [ ] Wire to the live OP portal address from the booted devnet.

---

## Phase 5 — Explorer ◐ scaffolded

- [x] `infra/explorer/` Blockscout stack (db + redis + backend + frontend) pointed at
      `op-geth` (compose validated).
- [ ] Privacy-aware views: commitment/nullifier event indexing, pool TVL, ASP status.

---

## Phase 6 — SDK + app

- [ ] `apps/web` deposit / transfer / withdraw.

---

## Phase 7 — Testnet

- [ ] Deploy to Base Sepolia.

---

## Phase 8 — Hardening & mainnet

- [ ] Trusted-setup ceremony, audit, mainnet deploy.

---

## Conventions

- All code, comments, identifiers, and commits in **English**.
- Every circuit change re-runs setup and re-exports its verifier; verifiers are
  generated artifacts, never hand-edited.
- Field/hash scheme is defined once in [privacy-design.md](./privacy-design.md) and
  must match across circuits ⇄ contracts ⇄ SDK.
- **CI** ([.github/workflows/ci.yml](../.github/workflows/ci.yml)) runs the full gate on every
  push/PR: install circom → compile + trusted setup → sdk/circuits/contracts tests → web build.
