# infra/op-stack — local single-sequencer L3 (Phase 2)

Docker Compose stack that runs **shh** as an OP Stack L3 settling to **Base**. Locally the
settlement layer (Base) is an `anvil` fork of Base Sepolia; the same compose deploys against
real Base Sepolia / mainnet by pointing `L1_RPC` at the live endpoint and supplying funded keys.

> Status: **scaffold.** Service topology and env are defined below; genesis + rollup-config
> generation and first boot are Phase 2 in [../../docs/workflow.md](../../docs/workflow.md).

## Topology

```
 anvil (Base fork)  ←─ batches/outputs ──  op-batcher / op-proposer
        │  L1 contracts (OptimismPortal, L1StandardBridge, …) deployed here
        ▼
 op-geth (L3 EL)  ⇄  op-node (L3 sequencer / derivation)
```

| Service       | Image                                                     | Role                             |
| ------------- | --------------------------------------------------------- | -------------------------------- |
| `l1`          | `ghcr.io/foundry-rs/foundry` (anvil)                      | Base fork = settlement layer     |
| `op-geth`     | `us-docker.pkg.dev/oplabs-tools-artifacts/images/op-geth` | L3 execution engine              |
| `op-node`     | `.../op-node`                                             | L3 derivation + single sequencer |
| `op-batcher`  | `.../op-batcher`                                          | posts L3 batches to Base         |
| `op-proposer` | `.../op-proposer`                                         | posts L3 output roots to Base    |

## Generate config (Phase 2)

```bash
# 1. deploy OP Stack L1 contracts onto the Base fork + emit genesis/rollup config
./scripts/generate.sh        # wraps op-deployer; writes ./configs/{genesis,rollup}.json + jwt
# 2. boot
docker compose up -d
# 3. verify
cast block latest --rpc-url http://localhost:9545
```

## Two chain profiles (Phase 3)

Both profiles share this stack; they differ in genesis predeploys and default value path:

- **Profile A — full privacy chain**: `ShieldedPool` predeployed; the default wallet/UX
  routes transfers through shielded notes.
- **Profile B — open L3 + Privacy Pool**: transparent L3; `PrivacyPool` + ASP deployed as
  app-layer contracts via `@shh/contracts` `deploy:local`.

Select with `SHH_PROFILE=full-privacy|open-pool` in `.env`.
