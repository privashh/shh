# infra/explorer — block explorer (Blockscout)

Blockscout pointed at the shh L3 (`op-geth`). Minimal stack: postgres + redis + backend +
frontend.

## Run

```bash
cp .env.example .env        # set SECRET_KEY_BASE (openssl rand -base64 48) and L2 RPC
docker compose up -d
# backend API → http://localhost:4000   frontend → http://localhost:3001
```

`L2_RPC_HTTP` defaults to `http://host.docker.internal:9545`, which reaches the op-stack
compose running on the host. Point it at Base Sepolia / mainnet to index a live deployment.

## Privacy-aware views (next)

Beyond standard blocks/txs/accounts, custom indexers surface only public aggregates — never
linkages:

- `Deposit` / `Withdrawal` (PrivacyPool) → pool TVL, deposit & withdrawal counts.
- `NewCommitment` / `NewNullifier` (ShieldedPool) → shielded set size, spent nullifiers.
- `RootPublished` (AssociationSetProvider) → current association root + ASP status.
