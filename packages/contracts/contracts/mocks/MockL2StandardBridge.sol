// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IL2StandardBridge} from "../interfaces/IL2StandardBridge.sol";

/// @notice Test-only L2StandardBridge: delivers the ETH to `_to` immediately (the real bridge
/// completes the L2→L1 withdrawal on Base after the challenge period).
contract MockL2StandardBridge is IL2StandardBridge {
    event WithdrawalInitiated(address indexed to, uint256 amount);

    function bridgeETHTo(address _to, uint32, bytes calldata) external payable {
        (bool ok, ) = _to.call{value: msg.value}("");
        require(ok, "mock: deliver failed");
        emit WithdrawalInitiated(_to, msg.value);
    }
}
