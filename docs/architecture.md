# shh — Architecture

```
                          Ethereum L1
                              │  (settlement of Base)
                          ┌───┴────┐
                          │  Base   │   L2 (OP Stack)
                          └───┬────┘
            standard bridge   │   shielded bridge
                          ┌───┴────────────────────┐
                          │        shh  (L3)        │   OP Stack rollup, single sequencer
                          │  settles batches to Base │
                          ├──────────────────────────┤
   Profile A (full priv) │  ShieldedPool (UTXO)      │  Profile B (open + pool)
                          │  every transfer = note    │  transparent EVM +
                          │                           │  PrivacyPool (fixed denom + ASP)
                          └──────────────────────────┘
```

## Component map

| Layer     | Component                                    | Tech               | Package              |
| --------- | -------------------------------------------- | ------------------ | -------------------- |
| Proofs    | UTXO join-split, Privacy-Pool withdraw       | Circom + Groth16   | `packages/circuits`  |
| Contracts | Pools, Merkle tree, bridges, verifiers       | Solidity (Hardhat) | `packages/contracts` |
| Client    | Notes, Merkle, witness/proof gen             | TypeScript         | `packages/sdk`       |
| Chain     | op-geth / op-node / op-batcher / op-proposer | Docker Compose     | `infra/op-stack`     |
| Chain (SVM) | agave node + settler (anchors to Solana)   | Docker Compose     | `infra/svm-l2`       |
| Bridge (SVM) | Solana L1 vault program + deposit relayer | Rust + Node        | `packages/svm-bridge` |
| Indexer   | Block explorer                               | Blockscout         | `infra/explorer`     |
| App       | Deposit / transfer / withdraw UI             | Next.js            | `apps/web`           |

## Why an L3 on Base

- **Settlement to Base** inherits Base's security and its L1 (Ethereum) finality, while
  giving shh its own block space, gas token policy, and privacy-native predeploys.
- **Single sequencer** locally keeps the devnet deterministic and cheap; the same images
  deploy against Base Sepolia / mainnet by swapping the L1 (settlement) endpoint and keys.

## Two privacy profiles

- **Profile A — Full privacy chain.** The `ShieldedPool` is the canonical value layer.
  Balances live as UTXO note commitments in a Poseidon Merkle tree; transfers are
  join-split proofs. There are no transparent transfers in the default UX.
- **Profile B — Open L3 + Privacy Pool.** A normal transparent EVM L3. Privacy is opt-in
  via the fixed-denomination `PrivacyPool`. Withdrawals require an **Association Set**
  membership proof, so an ASP (Association Set Provider) can scope which deposits may exit
  — _unlockable_, i.e. compliance-compatible privacy.

Both profiles reuse the same circuits, Merkle tree, and verifier infrastructure; the
difference is which contract is the default value path and what the predeploys/genesis set.

## Data flow — Profile B (Privacy Pool)

```
deposit(commitment)               withdraw(proof, root, assocRoot, nullifierHash, recipient)
  user picks (nullifier, secret)    user proves:
  commitment = H(nullifier,secret)    • commitment ∈ stateRoot     (it exists)
  contract inserts into state tree    • commitment ∈ assocRoot      (it's approved)
                                      • nullifierHash = H(nullifier) (no double spend)
                                    without revealing which commitment.
```

## Data flow — Profile A (Shielded UTXO)

```
note = H(amount, pubKey, blinding),  pubKey = H(privKey)
transaction proof (2-in / 2-out):
  • each input note ∈ stateRoot
  • nullifier = H(commitment, pathIndices, sign(privKey, …))   (no double spend)
  • Σ inAmounts + publicAmount = Σ outAmounts                   (value conserved)
  • extDataHash binds recipient / relayer / fee / encrypted outputs
publicAmount > 0 ⇒ deposit, < 0 ⇒ withdraw, = 0 ⇒ private transfer.
```

## SVM track (Solana)

The same cryptographic core targets a second execution layer: an SVM chain settling to
Solana. The circuits are BN254 and Solana exposes the `alt_bn128` syscalls, so the Groth16
verifiers port without changing the proving stack.

Today (phase 1): `infra/svm-l2` runs a single-node SVM devnet — program deploys enabled,
Token-2022 confidential transfers natively available — with a settler anchoring the ledger
tip to Solana devnet. `packages/svm-bridge` is the Solana-side vault: deposits lock SOL on
L1 and a relayer credits the L2 1:1. Withdrawals stay operator-signed until proof-gated
settlement lands; see the package READMEs for the trust model and phase map.

## Trust & upgrade model

- Groth16 requires a per-circuit trusted setup; mainnet uses a multi-party Powers-of-Tau
  ceremony (Phase 8). Dev uses a single-contributor setup — **never** for production funds.
- Contracts deploy behind a timelock-governed proxy with an emergency pause; verifiers and
  Merkle parameters are immutable per deployment.

See [privacy-design.md](./privacy-design.md) for exact hash/field definitions and circuit
signal layouts, and [workflow.md](./workflow.md) for the phased build plan.
