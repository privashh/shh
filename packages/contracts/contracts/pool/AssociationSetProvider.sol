// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAssociationSetProvider} from "../interfaces/IAssociationSetProvider.sol";

/// @notice Publishes the compliance association-set Merkle root. The ASP operator
/// recomputes the root off-chain over the set of deposits deemed compliant and
/// publishes it here; withdrawals must prove membership in a published root.
contract AssociationSetProvider is IAssociationSetProvider {
    address public asp;
    uint256 public currentRoot;
    mapping(uint256 => bool) public published;

    event RootPublished(uint256 indexed root, string dataURI);
    event AspTransferred(address indexed previous, address indexed next);

    error NotAsp();

    modifier onlyAsp() {
        if (msg.sender != asp) revert NotAsp();
        _;
    }

    constructor(address _asp) {
        asp = _asp;
        emit AspTransferred(address(0), _asp);
    }

    /// @param root        new association-set Merkle root
    /// @param dataURI     pointer (e.g. IPFS CID) to the published membership list
    function publishRoot(uint256 root, string calldata dataURI) external onlyAsp {
        published[root] = true;
        currentRoot = root;
        emit RootPublished(root, dataURI);
    }

    function isValidAssociationRoot(uint256 root) external view returns (bool) {
        return published[root];
    }

    function transferAsp(address next) external onlyAsp {
        emit AspTransferred(asp, next);
        asp = next;
    }
}
