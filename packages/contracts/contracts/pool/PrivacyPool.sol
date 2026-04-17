// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MerkleTreeWithHistory} from "../merkle/MerkleTreeWithHistory.sol";
import {IHasher} from "../interfaces/IHasher.sol";
import {IPoolWithdrawVerifier} from "../interfaces/IVerifiers.sol";
import {IAssociationSetProvider} from "../interfaces/IAssociationSetProvider.sol";

/// @title PrivacyPool — fixed-denomination, compliance-compatible privacy pool.
/// @notice Deposits of a fixed `denomination` insert a commitment into the state tree.
/// Withdrawals prove, in zero knowledge, membership of that commitment in BOTH the
/// state tree and an ASP-published association tree, and reveal a nullifierHash to
/// prevent double spend — without revealing which commitment. Excluding a deposit from
/// the association set leaves it non-withdrawable through the private path ("unlockable").
contract PrivacyPool is MerkleTreeWithHistory {
    IPoolWithdrawVerifier public immutable verifier;
    uint256 public immutable denomination;

    IAssociationSetProvider public asp;
    address public owner;
    address public bridge; // L2 shielded bridge permitted to fund deposits

    mapping(bytes32 => bool) public nullifierHashes;
    mapping(bytes32 => bool) public commitments;

    event Deposit(bytes32 indexed commitment, uint32 leafIndex, uint256 timestamp);
    event Withdrawal(
        address indexed to,
        bytes32 nullifierHash,
        address indexed relayer,
        uint256 fee
    );

    error BadValue();
    error NotOwner();
    error NotBridge();
    error DuplicateCommitment();
    error AlreadySpent();
    error UnknownStateRoot();
    error InvalidAssociationRoot();
    error FeeTooHigh();
    error InvalidProof();
    error RefundMismatch();
    error PaymentFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(
        IPoolWithdrawVerifier _verifier,
        IHasher _hasher,
        uint32 _levels,
        uint256 _denomination,
        IAssociationSetProvider _asp
    ) MerkleTreeWithHistory(_levels, _hasher) {
        require(_denomination > 0, "denomination=0");
        verifier = _verifier;
        denomination = _denomination;
        asp = _asp;
        owner = msg.sender;
    }

    /// @notice Deposit exactly `denomination`; `commitment = Poseidon(nullifier, secret)`.
    function deposit(bytes32 commitment) external payable {
        if (msg.value != denomination) revert BadValue();
        _deposit(commitment);
    }

    /// @notice Deposit funded by the shielded bridge (value minted on shh via the OP portal).
    function depositFor(bytes32 commitment) external payable {
        if (msg.sender != bridge) revert NotBridge();
        if (msg.value != denomination) revert BadValue();
        _deposit(commitment);
    }

    function _deposit(bytes32 commitment) internal {
        if (commitments[commitment]) revert DuplicateCommitment();
        uint32 index = _insert(uint256(commitment));
        commitments[commitment] = true;
        emit Deposit(commitment, index, block.timestamp);
    }

    /// @notice Withdraw `denomination - fee` to `recipient`, paying `fee` to `relayer`.
    /// @dev Public signal order MUST match the circuit:
    /// [stateRoot, associationRoot, nullifierHash, recipient, relayer, fee, refund].
    function withdraw(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        bytes32 stateRoot,
        bytes32 associationRoot,
        bytes32 nullifierHash,
        address payable recipient,
        address payable relayer,
        uint256 fee,
        uint256 refund
    ) external payable {
        if (fee > denomination) revert FeeTooHigh();
        if (nullifierHashes[nullifierHash]) revert AlreadySpent();
        if (!isKnownRoot(uint256(stateRoot))) revert UnknownStateRoot();
        if (!asp.isValidAssociationRoot(uint256(associationRoot))) revert InvalidAssociationRoot();
        if (msg.value != refund) revert RefundMismatch();

        uint256[7] memory input = [
            uint256(stateRoot),
            uint256(associationRoot),
            uint256(nullifierHash),
            uint256(uint160(address(recipient))),
            uint256(uint160(address(relayer))),
            fee,
            refund
        ];
        if (!verifier.verifyProof(a, b, c, input)) revert InvalidProof();

        nullifierHashes[nullifierHash] = true;

        (bool ok, ) = recipient.call{value: denomination - fee}("");
        if (!ok) revert PaymentFailed();

        if (fee > 0) {
            (bool okFee, ) = relayer.call{value: fee}("");
            if (!okFee) revert PaymentFailed();
        }
        if (refund > 0) {
            (bool okRefund, ) = recipient.call{value: refund}("");
            if (!okRefund) {
                (bool okBack, ) = relayer.call{value: refund}("");
                if (!okBack) revert PaymentFailed();
            }
        }

        emit Withdrawal(recipient, nullifierHash, relayer, fee);
    }

    function setBridge(address _bridge) external onlyOwner {
        bridge = _bridge;
    }

    function setAsp(IAssociationSetProvider _asp) external onlyOwner {
        asp = _asp;
    }

    function transferOwnership(address next) external onlyOwner {
        owner = next;
    }
}
