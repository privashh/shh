pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";

// Poseidon hash of an ordered pair — one internal Merkle node.
template HashLeftRight() {
    signal input left;
    signal input right;
    signal output hash;

    component hasher = Poseidon(2);
    hasher.inputs[0] <== left;
    hasher.inputs[1] <== right;
    hash <== hasher.out;
}
