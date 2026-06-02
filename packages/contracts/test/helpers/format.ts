import { toFixedHex, type ExtData } from "@privashh/sdk";
import type { TransactionResult } from "@privashh/sdk/node";

/// Shape a TransactionResult into the ShieldedPool.Proof struct for ethers.
export function toProofArgs(txn: TransactionResult) {
  return {
    a: txn.proof.a,
    b: txn.proof.b,
    c: txn.proof.c,
    root: txn.root,
    publicAmount: txn.publicAmount,
    extDataHash: toFixedHex(txn.extDataHash),
    inputNullifiers: [toFixedHex(txn.inputNullifiers[0]), toFixedHex(txn.inputNullifiers[1])] as [
      string,
      string,
    ],
    outputCommitments: [
      toFixedHex(txn.outputCommitments[0]),
      toFixedHex(txn.outputCommitments[1]),
    ] as [string, string],
  };
}

/// Shape ExtData into the ShieldedPool.ExtData struct for ethers.
export function toExtDataArg(ext: ExtData) {
  return {
    recipient: ext.recipient,
    extAmount: ext.extAmount,
    relayer: ext.relayer,
    fee: ext.fee,
    encryptedOutput1: ext.encryptedOutput1,
    encryptedOutput2: ext.encryptedOutput2,
  };
}
