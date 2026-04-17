// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MerkleTreeWithHistory} from "../merkle/MerkleTreeWithHistory.sol";
import {IHasher} from "../interfaces/IHasher.sol";
import {ITransaction2x2Verifier} from "../interfaces/IVerifiers.sol";

/// @title ShieldedPool
/// @notice UTXO shielded pool: arbitrary-amount notes spent via 2-in/2-out join-split
///         proofs. `publicAmount = (extAmount − fee) mod p` settles deposits/withdrawals
///         against the caller; internal transfers net to zero.
contract ShieldedPool is MerkleTreeWithHistory {
    ITransaction2x2Verifier public immutable verifier;
    uint256 public constant MAX_EXT_AMOUNT = 2 ** 248;

    mapping(uint256 => bool) public nullifierHashes;
    mapping(uint256 => bool) public commitments;

    struct ExtData {
        address recipient;
        int256 extAmount;
        address relayer;
        uint256 fee;
        bytes encryptedOutput1;
        bytes encryptedOutput2;
    }

    struct Proof {
        uint256[8] proof;
        uint256 root;
        uint256 publicAmount;
        uint256 extDataHash;
        uint256[2] inputNullifiers;
        uint256[2] outputCommitments;
    }

    event NewCommitment(uint256 indexed commitment, uint32 indexed index, bytes encryptedOutput);
    event NewNullifier(uint256 indexed nullifier);

    constructor(
        uint32 _levels,
        IHasher _hasher,
        ITransaction2x2Verifier _verifier
    ) MerkleTreeWithHistory(_levels, _hasher) {
        verifier = _verifier;
    }

    function _calcPublicAmount(int256 extAmount, uint256 fee) internal pure returns (uint256) {
        require(fee < MAX_EXT_AMOUNT, "fee too large");
        require(extAmount > -int256(MAX_EXT_AMOUNT) && extAmount < int256(MAX_EXT_AMOUNT), "ext amount out of range");
        int256 publicAmount = extAmount - int256(fee);
        return uint256(publicAmount);
    }

    /// @notice Spend two input notes and create two output notes in one join-split.
    function transact(Proof calldata args, ExtData calldata extData) external payable {
        require(isKnownRoot(args.root), "unknown root");
        for (uint256 i = 0; i < args.inputNullifiers.length; i++) {
            require(!nullifierHashes[args.inputNullifiers[i]], "input already spent");
        }
        require(uint256(keccak256(abi.encode(extData))) % FIELD_SIZE == args.extDataHash, "ext data hash mismatch");
        require(args.publicAmount == _calcPublicAmount(extData.extAmount, extData.fee), "public amount mismatch");

        require(
            verifier.verifyProof(
                [args.proof[0], args.proof[1]],
                [[args.proof[2], args.proof[3]], [args.proof[4], args.proof[5]]],
                [args.proof[6], args.proof[7]],
                [args.root, args.publicAmount, args.extDataHash, args.inputNullifiers[0], args.inputNullifiers[1], args.outputCommitments[0], args.outputCommitments[1]]
            ),
            "invalid transaction proof"
        );

        if (extData.extAmount > 0) {
            require(msg.value == uint256(extData.extAmount), "incorrect deposit amount");
        }

        for (uint256 i = 0; i < args.inputNullifiers.length; i++) {
            nullifierHashes[args.inputNullifiers[i]] = true;
            emit NewNullifier(args.inputNullifiers[i]);
        }

        uint32 index1 = _insert(args.outputCommitments[0]);
        _insert(args.outputCommitments[1]);
        emit NewCommitment(args.outputCommitments[0], index1, extData.encryptedOutput1);
        emit NewCommitment(args.outputCommitments[1], index1 + 1, extData.encryptedOutput2);

        if (extData.extAmount < 0) {
            uint256 withdrawAmount = uint256(-extData.extAmount);
            (bool ok, ) = extData.recipient.call{value: withdrawAmount}("");
            require(ok, "withdraw payment failed");
        }

        if (extData.fee > 0) {
            (bool okF, ) = extData.relayer.call{value: extData.fee}("");
            require(okF, "fee payment failed");
        }
    }
}
