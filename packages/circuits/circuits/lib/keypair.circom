pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";

// Public key derived from a private key: pubKey = Poseidon(privKey).
template Keypair() {
    signal input privateKey;
    signal output publicKey;

    component hasher = Poseidon(1);
    hasher.inputs[0] <== privateKey;
    publicKey <== hasher.out;
}

// Spend authorization signature over a note: H(privKey, commitment, merklePath).
// Binding the Merkle path makes a nullifier unique to a note's tree position.
template Signature() {
    signal input privateKey;
    signal input commitment;
    signal input merklePath;
    signal output out;

    component hasher = Poseidon(3);
    hasher.inputs[0] <== privateKey;
    hasher.inputs[1] <== commitment;
    hasher.inputs[2] <== merklePath;
    out <== hasher.out;
}
