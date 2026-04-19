// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal OP Stack L2StandardBridge surface (predeploy 0x42...10). Sending ETH here
/// initiates a canonical L2→L1 withdrawal that releases to `_to` on Base after finalization.
interface IL2StandardBridge {
    function bridgeETHTo(
        address _to,
        uint32 _minGasLimit,
        bytes calldata _extraData
    ) external payable;
}
