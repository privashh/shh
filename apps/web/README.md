# apps/web — shh privacy wallet (backend skeleton)

A Next.js app whose **backend is implemented** and whose **frontend is intentionally
deferred**. The route handlers give a future UI everything it needs; proving stays
client-side and is added with the frontend.

## API

| Route                               | Purpose                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------- |
| `GET /api/health`                   | liveness                                                                  |
| `GET /api/config`                   | chain id, RPC, contract addresses, circuit artifact URLs, relayer address |
| `GET /api/pool/leaves`              | Privacy Pool commitments in order (rebuild the state tree client-side)    |
| `GET /api/association/<commitment>` | association-set inclusion path for a commitment                           |
| `GET /api/shielded/events`          | Shielded Pool commitments + spent nullifiers (note scanning)              |
| `POST /api/relayer/withdraw`        | submit a gasless Privacy Pool withdrawal (relayer pays gas)               |

Config/addresses are read from `packages/contracts/deployments/<network>.json` (written by the
deploy script) or from env overrides. See `.env.example`.

## Run

```bash
# from the repo root, after deploying contracts to a local node:
pnpm --filter @shh/web dev      # http://localhost:3000
```

## What the frontend will add (later)

- Wallet connect (Base / shh L3), excluding USB hardware wallets per project policy.
- Privacy Pool + Shielded UTXO flows.
- Client-side Groth16 proving in a Web Worker (`snarkjs` + circuit wasm/zkey served from
  `/public/circuits`), using `@shh/sdk` for notes / Merkle / witness input.
- Design per the `frontend-design` skill — starts from the project's feeling, not convention.
