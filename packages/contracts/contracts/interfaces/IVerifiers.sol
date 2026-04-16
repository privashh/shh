// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Groth16 verifier for the Privacy Pool withdraw circuit (7 public signals:
/// stateRoot, associationRoot, nullifierHash, recipient, relayer, fee, refund).
interface IPoolWithdrawVerifier {
    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[7] calldata input
    ) external view returns (bool);
}

/// @notice Groth16 verifier for the shielded 2-in/2-out transaction circuit (7 public
/// signals: root, publicAmount, extDataHash, inputNullifier[2], outputCommitment[2]).
interface ITransactionVerifier {
    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[7] calldata input
    ) external view returns (bool);
}
