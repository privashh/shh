// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MerkleTreeWithHistory} from "../merkle/MerkleTreeWithHistory.sol";
import {IHasher} from "../interfaces/IHasher.sol";
import {IPoolWithdrawVerifier} from "../interfaces/IVerifiers.sol";
import {IAssociationSetProvider} from "../interfaces/IAssociationSetProvider.sol";

/// @title PrivacyPool
/// @notice Fixed-denomination Privacy Pool with compliance-compatible ("unlockable")
///         withdrawals: a withdrawal must prove membership in BOTH the state tree and an
///         ASP-published association tree.
contract PrivacyPool is MerkleTreeWithHistory {
    IPoolWithdrawVerifier public immutable verifier;
    IAssociationSetProvider public immutable asp;
    uint256 public immutable denomination;

    mapping(uint256 => bool) public nullifierHashes;
    mapping(uint256 => bool) public commitments;

    event Deposit(uint256 indexed commitment, uint32 leafIndex, uint256 timestamp);
    event Withdrawal(address indexed to, uint256 nullifierHash, address indexed relayer, uint256 fee);

    constructor(
        uint32 _levels,
        IHasher _hasher,
        IPoolWithdrawVerifier _verifier,
        IAssociationSetProvider _asp,
        uint256 _denomination
    ) MerkleTreeWithHistory(_levels, _hasher) {
        verifier = _verifier;
        asp = _asp;
        denomination = _denomination;
    }

    /// @notice Deposit exactly `denomination` wei under `commitment = H(nullifier, secret)`.
    function deposit(uint256 commitment) external payable {
        require(msg.value == denomination, "invalid denomination");
        require(!commitments[commitment], "commitment exists");
        require(commitment < FIELD_SIZE, "commitment >= field");

        uint32 leafIndex = _insert(commitment);
        commitments[commitment] = true;
        emit Deposit(commitment, leafIndex, block.timestamp);
    }

    /// @notice Withdraw `denomination − fee` to `recipient`, `fee` to `relayer`, proving
    ///         membership in the state tree and the ASP association tree without revealing which.
    function withdraw(
        uint256[8] calldata proof,
        uint256 stateRoot,
        uint256 associationRoot,
        uint256 nullifierHash,
        address recipient,
        address relayer,
        uint256 fee,
        uint256 refund
    ) external payable {
        require(!nullifierHashes[nullifierHash], "nullifier already spent");
        require(isKnownRoot(stateRoot), "unknown state root");
        require(fee <= denomination, "fee exceeds denomination");
        require(asp.isValidAssociationRoot(associationRoot), "invalid association root");

        require(
            verifier.verifyProof(
                [proof[0], proof[1]],
                [[proof[2], proof[3]], [proof[4], proof[5]]],
                [proof[6], proof[7]],
                [stateRoot, associationRoot, nullifierHash, uint256(uint160(recipient)), uint256(uint160(relayer)), fee, refund]
            ),
            "invalid withdraw proof"
        );

        uint256 amount = denomination - fee;
        (bool okR, ) = recipient.call{value: amount}("");
        require(okR, "recipient payment failed");
        if (fee > 0) {
            (bool okF, ) = relayer.call{value: fee}("");
            require(okF, "relayer payment failed");
        }
    }
}
