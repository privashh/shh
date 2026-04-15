// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Poseidon(2) hasher. Implemented by the EVM contract generated from
/// circomlibjs `poseidonContract`, so it matches the circuit's Poseidon exactly.
interface IHasher {
    function poseidon(uint256[2] calldata input) external pure returns (uint256);
}
