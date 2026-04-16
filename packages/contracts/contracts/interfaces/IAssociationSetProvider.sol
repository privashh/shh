// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Source of the compliance "association set" root. A withdrawal must prove
/// membership in a root accepted here, so the ASP governs which deposits may exit
/// privately ("unlockable" / compliance-compatible privacy).
interface IAssociationSetProvider {
    function isValidAssociationRoot(uint256 root) external view returns (bool);

    function currentRoot() external view returns (uint256);
}
