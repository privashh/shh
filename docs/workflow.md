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

## Phase 1 — Monorepo scaffold + privacy core ◐

The cryptographic heart of the project, independent of the chain it runs on.

- [x] pnpm monorepo (`packages/*`, `apps/*`) + shared TS config.
- [x] `@shh/circuits` — Circom circuits + Groth16 trusted setup.
- [ ] `@shh/contracts` — Hardhat pools, Merkle tree, verifiers.
- [x] `@shh/sdk` — note management, Merkle tree, witness + proof generation.

**Gate:** circuits compile + setup; sdk/circuits/contracts tests pass.

---

## Phase 2 — Local OP Stack devnet (single sequencer)

- [ ] `infra/op-stack` docker-compose: L1 + op-geth + op-node + op-batcher + op-proposer.
- [ ] Genesis + rollup config generation via op-deployer.

---

## Phase 3 — Two chain profiles

- [ ] Profile A — Full privacy chain (ShieldedPool predeploy).
- [ ] Profile B — Open L3 + Privacy Pool + ASP.

---

## Phase 4 — Bridges

- [ ] ShieldedBridge bidirectional (deposit + withdrawal).

---

## Phase 5 — Explorer

- [ ] Blockscout stack pointed at op-geth.

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
- Field/hash scheme is defined once and must match across circuits, contracts, and SDK.
