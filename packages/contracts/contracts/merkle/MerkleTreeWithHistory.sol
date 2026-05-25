// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IHasher} from "../interfaces/IHasher.sol";

/// @title MerkleTreeWithHistory — Poseidon incremental Merkle tree with a root ring buffer.
/// @notice Mirrors the SDK's `MerkleTree`: append-only leaves, Poseidon(left, right) nodes,
/// precomputed empty-subtree `zeros`, and a recent-root history so proofs built against a
/// slightly stale root still verify. `ZERO_VALUE = keccak256("shh") mod p`.
contract MerkleTreeWithHistory {
    uint256 public constant FIELD_SIZE =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 public constant ZERO_VALUE =
        13602612579684615825605231132845818358075790636291508357134507789605889596141;
    uint32 public constant ROOT_HISTORY_SIZE = 30;

    IHasher public immutable hasher;
    uint32 public immutable levels;

    mapping(uint256 => uint256) public filledSubtrees;
    mapping(uint256 => uint256) public zeros;
    mapping(uint256 => uint256) public roots;
    uint32 public currentRootIndex;
    uint32 public nextIndex;

    error LevelsOutOfRange();
    error TreeFull();
    error ValueOutOfField();

    constructor(uint32 _levels, IHasher _hasher) {
        if (_levels == 0 || _levels >= 32) revert LevelsOutOfRange();
        levels = _levels;
        hasher = _hasher;

        uint256 current = ZERO_VALUE;
        for (uint32 i = 0; i < _levels; i++) {
            zeros[i] = current;
            filledSubtrees[i] = current;
            current = hashLeftRight(current, current);
        }
        roots[0] = current; // root of the empty tree (== zeros[levels])
    }

    function hashLeftRight(uint256 left, uint256 right) public view returns (uint256) {
        if (left >= FIELD_SIZE || right >= FIELD_SIZE) revert ValueOutOfField();
        uint256[2] memory input;
        input[0] = left;
        input[1] = right;
        return hasher.poseidon(input);
    }

    function _insert(uint256 leaf) internal returns (uint32 index) {
        uint32 _nextIndex = nextIndex;
        if (_nextIndex == uint32(2) ** levels) revert TreeFull();

        uint32 currentIndex = _nextIndex;
        uint256 currentLevelHash = leaf;
        uint256 left;
        uint256 right;

        for (uint32 i = 0; i < levels; i++) {
            if (currentIndex % 2 == 0) {
                left = currentLevelHash;
                right = zeros[i];
                filledSubtrees[i] = currentLevelHash;
            } else {
                left = filledSubtrees[i];
                right = currentLevelHash;
            }
            currentLevelHash = hashLeftRight(left, right);
            currentIndex /= 2;
        }

        uint32 newRootIndex = (currentRootIndex + 1) % ROOT_HISTORY_SIZE;
        currentRootIndex = newRootIndex;
        roots[newRootIndex] = currentLevelHash;
        nextIndex = _nextIndex + 1;
        return _nextIndex;
    }

    /// @notice True if `_root` is the current root or within the recent-root history.
    function isKnownRoot(uint256 _root) public view returns (bool) {
        if (_root == 0) return false;
        uint32 _currentRootIndex = currentRootIndex;
        uint32 i = _currentRootIndex;
        do {
            if (_root == roots[i]) return true;
            if (i == 0) i = ROOT_HISTORY_SIZE;
            i--;
        } while (i != _currentRootIndex);
        return false;
    }

    function getLastRoot() public view returns (uint256) {
        return roots[currentRootIndex];
    }
}
