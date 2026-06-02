# infra/op-stack — single-sequencer L3 settling to Base

Docker Compose stack that runs **shh** as an OP Stack L3 settling to **Base Sepolia**. Base is an
L2 with no beacon/blob API, so op-node runs **without** a beacon (calldata DA +
`--l1.beacon.ignore` / `--l1.beacon.slot-duration-override`). Point `L1_RPC` at mainnet to target
production.

> Status: boot path **wired** (op-geth genesis-init, calldata DA, no-beacon op-node, fault-proof
> proposer). First boot needs operator inputs you must supply: funded `GS_*` keys on Base Sepolia,
> a Base Sepolia execution RPC, and the `DGF_ADDRESS` from `generate`. See [../../docs/workflow.md](../../docs/workflow.md).

## Topology

```
 Base Sepolia (L1: execution + beacon)  ←─ batches/outputs ──  op-batcher / op-proposer
        │  OP Stack L1 contracts (OptimismPortal, DisputeGameFactory, …) deployed by generate
        ▼
 op-geth (L3 EL)  ⇄  op-node (L3 sequencer / derivation)
```

| Service        | Image                                                     | Role                                     |
| -------------- | --------------------------------------------------------- | ---------------------------------------- |
| _Base Sepolia_ | external execution RPC (`L1_RPC`)                         | settlement layer (L1; no beacon needed)  |
| `op-geth-init` | `.../op-geth`                                             | one-shot `geth init` of the L3 genesis   |
| `op-geth`      | `us-docker.pkg.dev/oplabs-tools-artifacts/images/op-geth` | L3 execution engine                      |
| `op-node`      | `.../op-node`                                             | L3 derivation + single sequencer         |
| `op-batcher`   | `.../op-batcher`                                          | posts L3 batches to Base (calldata)      |
| `op-proposer`  | `.../op-proposer`                                         | posts L3 output roots to the DGF on Base |

## Bring it up

```bash
cp .env.example .env         # fill L1_RPC and funded GS_* keys (no beacon RPC needed)

# 1. deploy OP Stack L1 contracts onto Base Sepolia + emit genesis/rollup config
./scripts/generate.sh        # wraps op-deployer; writes ./configs/{genesis,rollup}.json + jwt
# 2. copy the DisputeGameFactory address from ./.deployer/state.json into DGF_ADDRESS in .env
# 3. boot (op-geth-init runs the genesis init, then the L3 services start)
docker compose up -d
# 4. verify L3 blocks are being produced
cast block latest --rpc-url http://localhost:9545
```

## Two chain profiles (Phase 3)

Both profiles share this stack; they differ in genesis predeploys and default value path:

- **Profile A — full privacy chain**: `ShieldedPool` predeployed; the default wallet/UX
  routes transfers through shielded notes.
- **Profile B — open L3 + Privacy Pool**: transparent L3; `PrivacyPool` + ASP deployed as
  app-layer contracts via `@shh/contracts` `deploy:local`.

Select with `SHH_PROFILE=full-privacy|open-pool` in `.env`.
