// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IHasher} from "../interfaces/IHasher.sol";

/// @title MerkleTreeWithHistory
/// @notice Incremental Poseidon Merkle tree.
/// @dev Mirrors the SDK `MerkleTree` and the circuit's tree: depth-20, Poseidon(2) nodes,
///      `ZERO_VALUE = keccak256("shh") mod p`.
abstract contract MerkleTreeWithHistory {
    uint256 public constant FIELD_SIZE =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 public constant ZERO_VALUE =
        13602612579684615825605231132845818358075790636291508357134507789605889596141;

    IHasher public immutable hasher;
    uint32 public immutable levels;

    uint256 public root;
    uint32 public nextIndex;

    // cached subtree state for incremental insertion
    mapping(uint256 => uint256) public filledSubtrees;
    mapping(uint256 => uint256) public zeros;

    constructor(uint32 _levels, IHasher _hasher) {
        require(_levels > 0 && _levels < 32, "levels out of range");
        levels = _levels;
        hasher = _hasher;

        uint256 currentZero = ZERO_VALUE;
        zeros[0] = currentZero;
        filledSubtrees[0] = currentZero;
        for (uint32 i = 1; i < _levels; i++) {
            currentZero = hasher.poseidon([currentZero, currentZero]);
            zeros[i] = currentZero;
            filledSubtrees[i] = currentZero;
        }

        root = hasher.poseidon([currentZero, currentZero]);
    }

    /// @notice Insert a leaf and return its index; updates the root.
    function _insert(uint256 leaf) internal returns (uint32 index) {
        uint32 _nextIndex = nextIndex;
        require(_nextIndex != uint32(2) ** levels, "tree is full");
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
            currentLevelHash = hasher.poseidon([left, right]);
            currentIndex /= 2;
        }

        root = currentLevelHash;
        nextIndex = _nextIndex + 1;
        return _nextIndex;
    }

    function getLastRoot() public view returns (uint256) {
        return root;
    }
}
