// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IOptimismPortal} from "../interfaces/IOptimismPortal.sol";

/// @title L1ShieldedBridge — deployed on Base (the shh settlement layer).
/// @notice Locks a fixed `denomination` on Base and, through the OP Stack portal,
/// triggers a deposit transaction on shh that mints the funds to the L2 shielded
/// bridge and inserts `commitment` into the Privacy Pool. The depositor's shh address
/// never holds the funds transparently — they arrive as a spendable shielded note.
contract L1ShieldedBridge {
    IOptimismPortal public immutable portal;
    address public immutable l2Bridge;
    uint256 public immutable denomination;
    uint64 public constant FINALIZE_GAS_LIMIT = 500_000;

    event ShieldedDepositInitiated(bytes32 indexed commitment, uint256 amount);

    error BadValue();

    constructor(IOptimismPortal _portal, address _l2Bridge, uint256 _denomination) {
        portal = _portal;
        l2Bridge = _l2Bridge;
        denomination = _denomination;
    }

    function bridgeShielded(bytes32 commitment) external payable {
        if (msg.value != denomination) revert BadValue();
        bytes memory message = abi.encodeWithSignature(
            "finalizeShieldedDeposit(bytes32)",
            commitment
        );
        portal.depositTransaction{value: denomination}(
            l2Bridge,
            denomination,
            FINALIZE_GAS_LIMIT,
            false,
            message
        );
        emit ShieldedDepositInitiated(commitment, denomination);
    }
}
