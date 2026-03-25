pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/switcher.circom";
include "circomlib/circuits/bitify.circom";

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

// Verifies a Merkle inclusion proof and outputs the implied root.
// `pathIndices` is a single field element whose i-th bit selects whether the
// running hash is the left (0) or right (1) child at level i.
template MerkleProof(levels) {
    signal input leaf;
    signal input pathElements[levels];
    signal input pathIndices;
    signal output root;

    component switcher[levels];
    component hasher[levels];

    component indexBits = Num2Bits(levels);
    indexBits.in <== pathIndices;

    for (var i = 0; i < levels; i++) {
        switcher[i] = Switcher();
        switcher[i].L <== i == 0 ? leaf : hasher[i - 1].hash;
        switcher[i].R <== pathElements[i];
        switcher[i].sel <== indexBits.out[i];

        hasher[i] = HashLeftRight();
        hasher[i].left <== switcher[i].outL;
        hasher[i].right <== switcher[i].outR;
    }

    root <== hasher[levels - 1].hash;
}
