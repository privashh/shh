# @shh/asp-publisher

Daemon that keeps the Privacy Pool's **association-set Merkle root** published on-chain.

Privacy Pool withdrawals must prove membership in an association root that the ASP has
published via `AssociationSetProvider.publishRoot`. This service recomputes that root from the
live deposit set and republishes it whenever it changes, so each deposit becomes withdrawable
shortly after it lands. Previously published roots stay valid, so a proof built against any
historical root still verifies.

It must run with the **ASP signer key** (the address the `AssociationSetProvider` was deployed
with); the daemon refuses to start if its signer isn't the authorized ASP.

## Policy

Open-pool / option A: the association set is **all deposits**. A compliance-gated ASP filters the
commitment list before building the tree (and calls `revokeRoot` for roots that include a deposit
later found non-compliant). Plug that policy into `approvedCommitments` in `src/index.ts`.

## Run

```bash
pnpm --filter @shh/asp-publisher start
```

### Environment

| Var | Default | Notes |
| --- | --- | --- |
| `SHH_RPC_URL` | `http://127.0.0.1:9545` | L3 RPC (run next to op-geth) |
| `PRIVACY_POOL_ADDRESS` | — | required |
| `ASP_ADDRESS` | — | required |
| `ASP_SIGNER_PRIVATE_KEY` | — | required; must equal `AssociationSetProvider.asp()` |
| `POLL_INTERVAL_MS` | `15000` | how often to recompute + compare the root |
| `ASP_DATA_URI` | `all-deposits` | pointer recorded in the `RootPublished` event |

On the server it runs as a systemd service reading an `EnvironmentFile` (key kept at `chmod 600`).
