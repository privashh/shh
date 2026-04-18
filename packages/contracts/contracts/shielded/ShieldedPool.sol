// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MerkleTreeWithHistory} from "../merkle/MerkleTreeWithHistory.sol";
import {IHasher} from "../interfaces/IHasher.sol";
import {ITransactionVerifier} from "../interfaces/IVerifiers.sol";

/// @title ShieldedPool — arbitrary-amount shielded UTXO pool (join-split).
/// @notice Value lives as note commitments `Poseidon(amount, pubKey, blinding)` in a
/// Poseidon Merkle tree. A `transact` spends input notes (revealing their nullifiers),
/// creates output notes, and settles the net public amount with the outside world:
/// deposit (extAmount > 0), withdrawal (extAmount < 0), or private transfer (= 0).
contract ShieldedPool is MerkleTreeWithHistory {
    uint256 public constant MAX_EXT_AMOUNT = 2 ** 248;
    uint256 public constant MAX_FEE = 2 ** 248;

    ITransactionVerifier public immutable verifier;
    address public owner;
    address public bridge; // optional shielded bridge permitted to fund deposits

    mapping(bytes32 => bool) public nullifierHashes;

    struct Proof {
        uint256[2] a;
        uint256[2][2] b;
        uint256[2] c;
        uint256 root;
        uint256 publicAmount;
        bytes32 extDataHash;
        bytes32[2] inputNullifiers;
        bytes32[2] outputCommitments;
    }

    struct ExtData {
        address recipient;
        int256 extAmount;
        address relayer;
        uint256 fee;
        bytes encryptedOutput1;
        bytes encryptedOutput2;
    }

    event NewCommitment(bytes32 indexed commitment, uint32 leafIndex, bytes encryptedOutput);
    event NewNullifier(bytes32 indexed nullifier);

    error UnknownRoot();
    error ExtDataMismatch();
    error PublicAmountMismatch();
    error InvalidProof();
    error AlreadySpent();
    error InvalidDepositValue();
    error InvalidWithdrawValue();
    error AmountTooLarge();
    error PaymentFailed();
    error NotOwner();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(
        ITransactionVerifier _verifier,
        IHasher _hasher,
        uint32 _levels
    ) MerkleTreeWithHistory(_levels, _hasher) {
        verifier = _verifier;
        owner = msg.sender;
    }

    function transact(Proof calldata args, ExtData calldata extData) external payable {
        if (!isKnownRoot(args.root)) revert UnknownRoot();
        if (uint256(args.extDataHash) != _extDataHash(extData)) revert ExtDataMismatch();
        if (args.publicAmount != _calcPublicAmount(extData.extAmount, extData.fee)) {
            revert PublicAmountMismatch();
        }
        _verify(args);

        for (uint256 i = 0; i < args.inputNullifiers.length; i++) {
            bytes32 nullifier = args.inputNullifiers[i];
            if (nullifierHashes[nullifier]) revert AlreadySpent();
            nullifierHashes[nullifier] = true;
            emit NewNullifier(nullifier);
        }

        _settle(extData);

        uint32 idx0 = _insert(uint256(args.outputCommitments[0]));
        uint32 idx1 = _insert(uint256(args.outputCommitments[1]));
        emit NewCommitment(args.outputCommitments[0], idx0, extData.encryptedOutput1);
        emit NewCommitment(args.outputCommitments[1], idx1, extData.encryptedOutput2);
    }

    function _settle(ExtData calldata extData) internal {
        if (extData.extAmount > 0) {
            uint256 amount = uint256(extData.extAmount);
            if (amount >= MAX_EXT_AMOUNT) revert AmountTooLarge();
            // Deposits may be funded directly (msg.value) or by the bridge.
            if (msg.sender != bridge && msg.value != amount) revert InvalidDepositValue();
        } else {
            if (msg.value != 0) revert InvalidWithdrawValue();
            uint256 amount = uint256(-extData.extAmount);
            if (amount >= MAX_EXT_AMOUNT) revert AmountTooLarge();
            if (amount > 0) {
                (bool ok, ) = extData.recipient.call{value: amount}("");
                if (!ok) revert PaymentFailed();
            }
        }

        if (extData.fee > 0) {
            (bool okFee, ) = extData.relayer.call{value: extData.fee}("");
            if (!okFee) revert PaymentFailed();
        }
    }

    function _verify(Proof calldata args) internal view {
        uint256[7] memory input = [
            args.root,
            args.publicAmount,
            uint256(args.extDataHash),
            uint256(args.inputNullifiers[0]),
            uint256(args.inputNullifiers[1]),
            uint256(args.outputCommitments[0]),
            uint256(args.outputCommitments[1])
        ];
        if (!verifier.verifyProof(args.a, args.b, args.c, input)) revert InvalidProof();
    }

    /// @dev publicAmount = (extAmount - fee) mod p, matching the circuit's field arithmetic.
    function _calcPublicAmount(int256 extAmount, uint256 fee) internal pure returns (uint256) {
        require(fee < MAX_FEE, "fee too large");
        require(
            extAmount > -int256(MAX_EXT_AMOUNT) && extAmount < int256(MAX_EXT_AMOUNT),
            "ext range"
        );
        int256 publicAmount = extAmount - int256(fee);
        return publicAmount >= 0 ? uint256(publicAmount) : FIELD_SIZE - uint256(-publicAmount);
    }

    function _extDataHash(ExtData calldata extData) internal pure returns (uint256) {
        return uint256(keccak256(abi.encode(extData))) % FIELD_SIZE;
    }

    function setBridge(address _bridge) external onlyOwner {
        bridge = _bridge;
    }

    function transferOwnership(address next) external onlyOwner {
        owner = next;
    }
}
