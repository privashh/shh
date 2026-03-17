# shh — Architecture

```
                          Ethereum L1
                              │  (settlement of Base)
                          ┌───┴────┐
                          │  Base   │   L2 (OP Stack)
                          └───┬────┘
                          ┌───┴────────────────────┐
                          │        shh  (L3)        │   OP Stack rollup, single sequencer
                          │  settles batches to Base │
                          └──────────────────────────┘
```

## Component map

| Layer     | Component                                    | Tech               | Package              |
| --------- | -------------------------------------------- | ------------------ | -------------------- |
| Proofs    | UTXO join-split, Privacy-Pool withdraw       | Circom + Groth16   | `packages/circuits`  |
| Contracts | Pools, Merkle tree, bridges, verifiers       | Solidity (Hardhat) | `packages/contracts` |
| Client    | Notes, Merkle, witness/proof gen             | TypeScript         | `packages/sdk`       |
| App       | Deposit / transfer / withdraw UI             | Next.js            | `apps/web`           |

## Why an L3 on Base

- **Settlement to Base** inherits Base's security and its L1 (Ethereum) finality, while
  giving shh its own block space, gas token policy, and privacy-native predeploys.
- **Single sequencer** locally keeps the devnet deterministic and cheap; the same images
  deploy against Base Sepolia / mainnet by swapping the L1 (settlement) endpoint and keys.

## Two privacy profiles

- **Profile A — Full privacy chain.** The `ShieldedPool` is the canonical value layer.
  Balances live as UTXO note commitments in a Poseidon Merkle tree; transfers are
  join-split proofs.
- **Profile B — Open L3 + Privacy Pool.** A normal transparent EVM L3. Privacy is opt-in
  via the fixed-denomination `PrivacyPool` with an Association Set membership proof.

See workflow.md for the phased build plan.
