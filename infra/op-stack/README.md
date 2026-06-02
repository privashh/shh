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
| `rpc-proxy`    | `caddy`                                                   | public TLS endpoint for the L3 RPC       |

## Public RPC (TLS)

op-geth's HTTP port carries only the **public-safe** namespaces (`web3,eth,net`); the privileged
`miner` namespace the batcher needs (`miner_setMaxDASize`) lives on an **internal-only WS** port.
The raw HTTP port binds to loopback (`127.0.0.1:9545`) — only `rpc-proxy` (Caddy) is
internet-facing. Set `RPC_DOMAIN` in `.env`, point a DNS A record at this host, open ports
80/443, and Caddy provisions a Let's Encrypt cert automatically → public RPC at `https://$RPC_DOMAIN`.

## Bring it up

```bash
cp .env.example .env         # fill L1_RPC and funded GS_* keys (no beacon RPC needed)

# 1. deploy OP Stack contracts to Base Sepolia (custom intent — Base has no pre-deployed OPCM),
#    emit genesis/rollup/l1-chain-config/jwt, and record DGF_ADDRESS into .env
./scripts/generate.sh
# 2. boot (op-geth-init initialises the datadir, then the L3 services start)
docker compose up -d
# 3. verify L3 blocks are being produced
cast block latest --rpc-url http://localhost:9545
```

## Two chain profiles (Phase 3)

Both profiles share this stack; they differ in genesis predeploys and default value path:

- **Profile A — full privacy chain**: `ShieldedPool` predeployed; the default wallet/UX
  routes transfers through shielded notes.
- **Profile B — open L3 + Privacy Pool**: transparent L3; `PrivacyPool` + ASP deployed as
  app-layer contracts via `@shh/contracts` `deploy:local`.

Select with `SHH_PROFILE=full-privacy|open-pool` in `.env`.
