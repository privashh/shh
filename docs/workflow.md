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
- [x] Choose contract tooling: Hardhat + TypeScript (matches the JS proof-gen workflow).

**Gate:** decisions recorded in this doc and [architecture.md](./architecture.md).

---

## Phase 1 — Monorepo scaffold + privacy core ✅

The cryptographic heart of the project, independent of the chain it runs on.

- [x] pnpm monorepo (`packages/*`, `apps/*`) + shared TS config.
- [x] `@shh/circuits` — real Circom circuits (compiled; Groth16 setup done):
  - [x] `lib/` Poseidon Merkle proof + keypair helpers.
  - [x] `pool/` fixed-denomination Privacy Pool withdraw (state + association membership).
  - [x] `shielded/` UTXO join-split transaction (2-in / 2-out).
  - [x] compile + Powers-of-Tau + Groth16 setup + Solidity verifier export scripts.
- [x] `@shh/contracts` — Hardhat:
  - [x] `MerkleTreeWithHistory` (Poseidon, on-chain incremental tree).
  - [x] `PrivacyPool` (fixed denom, ASP-gated withdrawals).
  - [x] `ShieldedPool` (UTXO commitments, join-split).
  - [x] `ShieldedBridge` (L1/L2) bridging straight into the shielded set; OP portal interface.
  - [x] generated Groth16 verifiers wired in.
- [x] `@privashh/sdk` — note management, Merkle tree, witness + proof generation (isomorphic;
      browser-safe `.` entry + node-only `./node` proving entry).

**Gate:** ✅

- `pnpm circuits:compile && pnpm circuits:setup` produces `.wasm` + `.zkey` + verifier `.sol`.
- `pnpm circuits:test` (4/4): valid witness proves+verifies; tampered witness fails constraints.
- `pnpm --filter @privashh/sdk test` (9/9): Poseidon/Merkle/notes, value conservation, ZERO_VALUE.
- `pnpm contracts:test` passes (10/10): deposit → prove → withdraw for both pools, double-spend
  rejected, association-gating, **shielded-bridge deposit AND withdrawal**, front-running.

---

## Phase 2 — OP Stack L3 settling to Base (single sequencer) ◐ boot wired

- [x] `infra/op-stack/docker-compose.yml`: `op-geth-init` (genesis init), `op-geth`, `op-node`
      (no-beacon: `--l1.beacon.ignore` + `slot-duration-override`), `op-batcher` (calldata DA),
      `op-proposer` (DisputeGameFactory). L1 = **real Base Sepolia**; Base is an L2 with no
      beacon/blob API, so op-node runs without a beacon and batches go as calldata.
- [x] Genesis + rollup config generation via `op-deployer` (`scripts/generate.sh` + `generate.ps1`).
- [x] `make generate / up / down / reset` (+ PowerShell on Windows).

**Gate (remaining = operator inputs, not code):** the boot path is fully wired and the compose
validates. First boot needs funded `GS_*` keys on Base Sepolia, a Base Sepolia execution RPC, and
the `DGF_ADDRESS` copied from `generate` output. With those, `make generate && docker compose
up` produces L3 blocks (`cast block latest`).

---

## Phase 3 — Two chain profiles ◐ scaffolded

Both profiles share the OP Stack base; they differ in the privacy model exposed.

- [x] Profile selector wired: `SHH_PROFILE=full-privacy|open-pool` in deploy + devnet env,
      recorded in the deployment manifest and surfaced via `/api/config`.
- [ ] **Profile A — Full privacy chain**: `ShieldedPool` predeploy + default UX through notes.
- [ ] **Profile B — Open L3 + Privacy Pool**: transparent L3 + `PrivacyPool` + ASP (app-layer
      deploy works today via `deploy:local`).
- [ ] Per-profile genesis predeploys (needs the booted devnet from Phase 2).

**Gate:** each profile boots from a single config flag and passes its smoke test.

---

## Phase 4 — Bridges ◐ scaffolded

- [x] `ShieldedBridge` **bidirectional**: deposit (Base → L3 note, via OP portal aliasing) and
      withdrawal (L3 note → Base, via the canonical L2StandardBridge). Both unit-tested.
- [x] Role-based deploy script `deployShieldedBridge.ts` (`BRIDGE_SIDE=l1|l2`, L2 std-bridge predeploy).
- [ ] Wire to the live OP portal address from the booted Phase 2 devnet.

**Gate:** end-to-end bridge test on a Base Sepolia fork: deposit appears as a
spendable shielded note on L3; withdrawal returns funds on Base.

---

## Phase 5 — Explorer ◐ scaffolded

- [x] `infra/explorer/` Blockscout stack (db + redis + backend + frontend) pointed at
      `op-geth` (compose validated).
- [ ] Privacy-aware views: commitment/nullifier event indexing, pool TVL, ASP status.

**Gate:** explorer shows L3 blocks/txs and decodes pool events (needs booted devnet).

---

## Phase 6 — SDK + app ◐ backend done, frontend deferred

- [x] `apps/web` **backend** (Next.js route handlers): config, pool leaves, association path,
      shielded events, relayer withdraw. Verified end to end against a local node.
- [x] Relayer: `POST /api/relayer/withdraw` (gasless Privacy Pool withdrawals).
- [x] Turn-key local stack: `pnpm dev` (chain + deploy + artifacts + backend).
- [x] `@privashh/sdk` isomorphic (poseidon-lite + Web Crypto), split into browser-safe `.` and
      node-only `./node` — browser proving is ready (no node builtins on the `.` entry).
- [ ] Frontend UI (deferred): wallet connect + deposit/transfer/withdraw, client-side
      Web-Worker proving (`snarkjs.min.js` + circuit wasm/zkey already staged in `public/`).

**Gate:** a user can deposit, privately transfer, and withdraw from the UI on devnet.

---

## Phase 7 — Testnet

- [ ] Deploy bridge + verifiers + pools to Base Sepolia.
- [ ] Public devnet sequencer; explorer hosted.

**Gate:** external wallet completes the full flow on Base Sepolia.

---

## Phase 8 — Hardening & mainnet

- [ ] Trusted-setup ceremony (multi-party Powers of Tau contribution).
- [ ] External audit of circuits + contracts; fuzz + invariant tests.
- [ ] Mainnet deploy with timelock-governed upgradeability and emergency pause.

**Gate:** audit findings resolved; ceremony transcript published; mainnet live.

---

## Conventions

- All code, comments, identifiers, and commits in **English**.
- Every circuit change re-runs setup and re-exports its verifier; verifiers are
  generated artifacts, never hand-edited.
- Field/hash scheme is defined once in [privacy-design.md](./privacy-design.md) and
  must match across circuits ⇄ contracts ⇄ SDK.
- **CI** ([.github/workflows/ci.yml](../.github/workflows/ci.yml)) runs the full gate on every
  push/PR: install circom → compile + trusted setup → sdk/circuits/contracts tests → web build.
- **Security**: see [SECURITY.md](../SECURITY.md) and [threat-model.md](./threat-model.md). The
  dev trusted setup is single-contributor and must not secure real funds.
