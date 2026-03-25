pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "../lib/merkleProof.circom";

// Fixed-denomination Privacy Pool withdrawal (compliance-compatible / "unlockable").
//
// Proves the caller knows the secrets behind a commitment that is a member of BOTH:
//   * the state tree   (the deposit exists), and
//   * the association tree (an ASP has marked the deposit as compliant),
// and reveals nullifierHash to prevent double withdrawal — without revealing which
// commitment. Excluding a deposit from the association tree makes it non-withdrawable
// through the private path, which is the regulatory equilibrium of Privacy Pools.
template PrivacyPoolWithdraw(levels) {
    // ── public ──
    signal input stateRoot;
    signal input associationRoot;
    signal input nullifierHash;
    signal input recipient;
    signal input relayer;
    signal input fee;
    signal input refund;

    // ── private ──
    signal input nullifier;
    signal input secret;
    signal input statePathElements[levels];
    signal input statePathIndices;
    signal input assocPathElements[levels];
    signal input assocPathIndices;

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

    // membership in the association (compliance) tree — same commitment leaf
    component assocTree = MerkleProof(levels);
    assocTree.leaf <== commitmentHasher.out;
    assocTree.pathIndices <== assocPathIndices;
    for (var i = 0; i < levels; i++) {
        assocTree.pathElements[i] <== assocPathElements[i];
    }
    assocTree.root === associationRoot;

    // Bind public withdrawal parameters into the proof so a relayer cannot tamper
    // with recipient/fee/etc. (constraints have no effect on the witness, but make the
    // values part of the proven statement — standard anti-front-running technique).
    signal recipientSquare <== recipient * recipient;
    signal relayerSquare   <== relayer * relayer;
    signal feeSquare       <== fee * fee;
    signal refundSquare    <== refund * refund;
}

component main {public [
    stateRoot,
    associationRoot,
    nullifierHash,
    recipient,
    relayer,
    fee,
    refund
]} = PrivacyPoolWithdraw(20);
