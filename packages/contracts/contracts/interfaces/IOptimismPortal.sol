// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal OP Stack OptimismPortal surface used by the shielded bridge.
/// Locking ETH here on Base creates a deposit transaction on shh that mints `_value`
/// to `_to` and executes `_data`.
interface IOptimismPortal {
    function depositTransaction(
        address _to,
        uint256 _value,
        uint64 _gasLimit,
        bool _isCreation,
        bytes calldata _data
    ) external payable;
}
