// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice OP Stack / Arbitrum L1→L2 address aliasing. A deposit transaction's L2
/// `msg.sender` is the L1 sender aliased by this offset, which the L2 side checks.
library AddressAliasHelper {
    uint160 internal constant OFFSET = uint160(0x1111000000000000000000000000000000001111);

    function applyL1ToL2Alias(address l1Address) internal pure returns (address l2Address) {
        unchecked {
            l2Address = address(uint160(l1Address) + OFFSET);
        }
    }

    function undoL1ToL2Alias(address l2Address) internal pure returns (address l1Address) {
        unchecked {
            l1Address = address(uint160(l2Address) - OFFSET);
        }
    }
}
