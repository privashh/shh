// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IOptimismPortal} from "../interfaces/IOptimismPortal.sol";

/// @notice Test-only stand-in for the OP Stack portal. It records the deposit so a test
/// can replay it from the aliased L1 sender (which the real portal does cross-domain).
/// It does NOT relay on-chain, because the EVM cannot spoof the aliased msg.sender — the
/// shielded-bridge test impersonates the aliased address instead.
contract MockOptimismPortal is IOptimismPortal {
    event DepositTransaction(
        address indexed to,
        uint256 value,
        uint64 gasLimit,
        bool isCreation,
        bytes data
    );

    function depositTransaction(
        address _to,
        uint256 _value,
        uint64 _gasLimit,
        bool _isCreation,
        bytes calldata _data
    ) external payable {
        require(msg.value == _value, "mock: value mismatch");
        emit DepositTransaction(_to, _value, _gasLimit, _isCreation, _data);
    }
}
