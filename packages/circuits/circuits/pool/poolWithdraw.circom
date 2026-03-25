pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "../lib/merkleProof.circom";

// Fixed-denomination Privacy Pool withdrawal.
//
// Proves the caller knows the secrets behind a commitment that exists in the state
// tree, and reveals nullifierHash to prevent double withdrawal — without revealing
// which commitment.
template PrivacyPoolWithdraw(levels) {
    // ── public ──
    signal input stateRoot;
    signal input nullifierHash;
    signal input recipient;

    // ── private ──
    signal input nullifier;
    signal input secret;
    signal input statePathElements[levels];
    signal input statePathIndices;

    // commitment = H(nullifier, secret)
    component commitmentHasher = Poseidon(2);
    commitmentHasher.inputs[0] <== nullifier;
    commitmentHasher.inputs[1] <== secret;

    // nullifierHash = H(nullifier)
    component nullifierHasher = Poseidon(1);
    nullifierHasher.inputs[0] <== nullifier;
    nullifierHasher.out === nullifierHash;

    // membership in the state tree
    component stateTree = MerkleProof(levels);
    stateTree.leaf <== commitmentHasher.out;
    stateTree.pathIndices <== statePathIndices;
    for (var i = 0; i < levels; i++) {
        stateTree.pathElements[i] <== statePathElements[i];
    }
    stateTree.root === stateRoot;
}

component main {public [stateRoot, nullifierHash, recipient]} = PrivacyPoolWithdraw(20);
