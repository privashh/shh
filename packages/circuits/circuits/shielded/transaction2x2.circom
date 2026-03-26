pragma circom 2.1.6;

include "./transaction.circom";

// 2-input / 2-output shielded transaction over a depth-20 Merkle tree.
component main {public [
    root,
    publicAmount,
    extDataHash,
    inputNullifier,
    outputCommitment
]} = Transaction(20, 2, 2);
