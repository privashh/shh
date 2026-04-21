// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PrivacyPool} from "../pool/PrivacyPool.sol";
import {IL2StandardBridge} from "../interfaces/IL2StandardBridge.sol";
import {AddressAliasHelper} from "../libraries/AddressAliasHelper.sol";

/// @title L2ShieldedBridge — deployed on shh (the L3). Bridges in BOTH directions:
///
///  - deposit (Base → L3): the OP portal mints `denomination` here and calls
///    `finalizeShieldedDeposit`, which forwards it into the Privacy Pool as a shielded note.
///  - withdraw (L3 → Base): `bridgeWithdraw` spends a pool note (proof binds the recipient to
///    this contract), then sends the withdrawn ETH to `l1Recipient` over the canonical
///    L2StandardBridge — the user's L3 address never touches the funds transparently.
contract L2ShieldedBridge {
    PrivacyPool public immutable pool;
    address public immutable l1Bridge;
    IL2StandardBridge public immutable l2StandardBridge;

    event ShieldedDepositFinalized(bytes32 indexed commitment);
    event ShieldedWithdrawInitiated(
        bytes32 indexed nullifierHash,
        address indexed l1Recipient,
        uint256 amount
    );

    error Unauthorized();
    error BadValue();

    constructor(PrivacyPool _pool, address _l1Bridge, IL2StandardBridge _l2StandardBridge) {
        pool = _pool;
        l1Bridge = _l1Bridge;
        l2StandardBridge = _l2StandardBridge;
    }

    function finalizeShieldedDeposit(bytes32 commitment) external payable {
        if (msg.sender != AddressAliasHelper.applyL1ToL2Alias(l1Bridge)) revert Unauthorized();
        if (msg.value != pool.denomination()) revert BadValue();
        pool.depositFor{value: msg.value}(commitment);
        emit ShieldedDepositFinalized(commitment);
    }

    /// @dev The pool withdraw proof MUST bind `recipient` to this contract's address. The pool
    /// pays `denomination - fee` here; that amount is then bridged to `l1Recipient` on Base.
    function bridgeWithdraw(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        bytes32 stateRoot,
        bytes32 associationRoot,
        bytes32 nullifierHash,
        address l1Recipient,
        address payable relayer,
        uint256 fee,
        uint32 minGasLimit
    ) external {
        uint256 amount = pool.denomination() - fee;
        pool.withdraw(
            a,
            b,
            c,
            stateRoot,
            associationRoot,
            nullifierHash,
            payable(address(this)),
            relayer,
            fee,
            0
        );
        l2StandardBridge.bridgeETHTo{value: amount}(l1Recipient, minGasLimit, "");
        emit ShieldedWithdrawInitiated(nullifierHash, l1Recipient, amount);
    }

    receive() external payable {}
}
