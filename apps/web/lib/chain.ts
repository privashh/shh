import { Contract, JsonRpcProvider, Wallet } from "ethers";
import { getConfig } from "./config";
import { ASP_ABI, PRIVACY_POOL_ABI, SHIELDED_POOL_ABI } from "./abi";

export function provider(): JsonRpcProvider {
  return new JsonRpcProvider(getConfig().rpcUrl);
}

/** Relayer signer — only used by the relayer route. Requires RELAYER_PRIVATE_KEY. */
export function relayerSigner(): Wallet {
  const pk = process.env.RELAYER_PRIVATE_KEY;
  if (!pk) throw new Error("RELAYER_PRIVATE_KEY not set");
  return new Wallet(pk, provider());
}

export function privacyPool(runner: JsonRpcProvider | Wallet = provider()): Contract {
  const address = getConfig().contracts.privacyPool;
  if (!address) throw new Error("privacyPool address not configured");
  return new Contract(address, PRIVACY_POOL_ABI, runner);
}

export function shieldedPool(runner: JsonRpcProvider | Wallet = provider()): Contract {
  const address = getConfig().contracts.shieldedPool;
  if (!address) throw new Error("shieldedPool address not configured");
  return new Contract(address, SHIELDED_POOL_ABI, runner);
}

export function associationSetProvider(runner: JsonRpcProvider | Wallet = provider()): Contract {
  const address = getConfig().contracts.associationSetProvider;
  if (!address) throw new Error("associationSetProvider address not configured");
  return new Contract(address, ASP_ABI, runner);
}
