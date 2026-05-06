import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export interface ShhConfig {
  network: string;
  chainId: number;
  rpcUrl: string;
  profile: string;
  denomination: string;
  contracts: {
    privacyPool?: string;
    shieldedPool?: string;
    associationSetProvider?: string;
    hasher?: string;
  };
  circuits: {
    poolWithdraw: { wasm: string; zkey: string };
    transaction2x2: { wasm: string; zkey: string };
  };
  relayer: { address?: string; feeBps: number };
}

function loadDeployment(network: string): any {
  const candidate = path.resolve(
    process.cwd(),
    "../../packages/contracts/deployments",
    `${network}.json`,
  );
  return existsSync(candidate) ? JSON.parse(readFileSync(candidate, "utf8")) : null;
}

/** Public configuration the frontend (later) and tools read. Never includes secrets. */
export function getConfig(): ShhConfig {
  const network = process.env.SHH_NETWORK || "localhost";
  const dep = loadDeployment(network);
  return {
    network,
    chainId: Number(process.env.SHH_CHAIN_ID || 31337),
    rpcUrl: process.env.SHH_RPC_URL || "http://127.0.0.1:8545",
    profile: dep?.profile || process.env.SHH_PROFILE || "open-pool",
    denomination: dep?.denomination || process.env.DENOMINATION || "100000000000000000",
    contracts: {
      privacyPool: process.env.PRIVACY_POOL_ADDRESS || dep?.contracts?.privacyPool,
      shieldedPool: process.env.SHIELDED_POOL_ADDRESS || dep?.contracts?.shieldedPool,
      associationSetProvider: process.env.ASP_ADDRESS || dep?.contracts?.associationSetProvider,
      hasher: dep?.contracts?.hasher,
    },
    circuits: {
      poolWithdraw: {
        wasm: "/circuits/poolWithdraw.wasm",
        zkey: "/circuits/poolWithdraw.zkey",
      },
      transaction2x2: {
        wasm: "/circuits/transaction2x2.wasm",
        zkey: "/circuits/transaction2x2.zkey",
      },
    },
    relayer: {
      address: process.env.RELAYER_ADDRESS,
      feeBps: Number(process.env.RELAYER_FEE_BPS || 50),
    },
  };
}
