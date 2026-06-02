// Node-only entry point: Groth16 proving via snarkjs (pulls node builtins + wasm). Browser
// code should import from "@privashh/sdk" and prove in a Web Worker instead.
import { groth16 } from "snarkjs";
import { formatProof, type SolidityProof } from "./proof";
import { buildPoolWithdrawInput, type PoolWithdrawInputParams } from "./pool";
import { buildTransactionInput, type TransactionInputParams } from "./utxo";
import type { ExtData } from "./utxo";

export async function prove(
  input: Record<string, unknown>,
  wasmPath: string,
  zkeyPath: string,
): Promise<{ proof: SolidityProof; publicSignals: string[]; raw: unknown }> {
  const { proof, publicSignals } = await groth16.fullProve(input, wasmPath, zkeyPath);
  return { proof: formatProof(proof), publicSignals, raw: proof };
}

export interface PoolWithdrawResult {
  proof: SolidityProof;
  stateRoot: bigint;
  associationRoot: bigint;
  nullifierHash: bigint;
  publicSignals: string[];
}

export async function generatePoolWithdraw(
  params: PoolWithdrawInputParams & { wasmPath: string; zkeyPath: string },
): Promise<PoolWithdrawResult> {
  const built = await buildPoolWithdrawInput(params);
  const { proof, publicSignals } = await prove(built.input, params.wasmPath, params.zkeyPath);
  return {
    proof,
    stateRoot: built.stateRoot,
    associationRoot: built.associationRoot,
    nullifierHash: built.nullifierHash,
    publicSignals,
  };
}

export interface TransactionResult {
  proof: SolidityProof;
  root: bigint;
  publicAmount: bigint;
  extDataHash: bigint;
  inputNullifiers: [bigint, bigint];
  outputCommitments: [bigint, bigint];
  extData: ExtData;
  publicSignals: string[];
}

export async function generateTransaction(
  params: TransactionInputParams & { wasmPath: string; zkeyPath: string },
): Promise<TransactionResult> {
  const built = await buildTransactionInput(params);
  const { proof, publicSignals } = await prove(built.input, params.wasmPath, params.zkeyPath);
  return {
    proof,
    root: built.root,
    publicAmount: built.publicAmount,
    extDataHash: built.extDataHash,
    inputNullifiers: built.inputNullifiers,
    outputCommitments: built.outputCommitments,
    extData: built.extData,
    publicSignals,
  };
}
