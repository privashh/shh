# @privashh/sdk

Client SDK for **shh**, a privacy L3 on Base (OP Stack). Notes, a Poseidon Merkle tree,
circuit witness builders, and Groth16 proof generation — for the fixed‑denomination
**Privacy Pool** (ASP‑gated withdrawals) and the **Shielded Pool** (2‑in / 2‑out UTXO
join‑split).

Isomorphic: the default entry is browser‑safe (pure‑JS Poseidon via `poseidon-lite` + Web
Crypto, no node builtins). Proving (which pulls `snarkjs` + wasm) lives behind a separate
`/node` entry so browsers can prove in a Web Worker instead.

```bash
npm install @privashh/sdk
```

## Two entry points

| Import | Contents | Runs in |
| --- | --- | --- |
| `@privashh/sdk` | notes, Poseidon, Merkle tree, witness‑input builders, proof formatting | browser **and** node |
| `@privashh/sdk/node` | Groth16 proving via snarkjs (`prove`, `generatePoolWithdraw`, `generateTransaction`) | node only |

Build the witness with the browser‑safe entry; do the proving either with `/node` (server/CLI)
or by posting the witness to a Web Worker that runs `snarkjs.groth16.fullProve` (browser).

## Constants & primitives (`@privashh/sdk`)

- `FIELD_SIZE` — BN254 scalar field every commitment/nullifier/Merkle node lives in.
- `LEVELS` — Merkle depth shared by every shh tree (state + association) = `20`.
- `ZERO_VALUE` — empty‑leaf value, `keccak256("shh") mod p`.
- `poseidon(inputs)` — circomlib‑compatible Poseidon (arities 1–8), async.
- `toFixedHex(value, length=32)` — left‑padded `0x` hex of a field element.
- `randomField()` — uniform random field element (Web Crypto).

## Merkle tree

```ts
import { MerkleTree, LEVELS } from "@privashh/sdk";

const tree = await MerkleTree.create(leaves /* bigint[] */, LEVELS);
const index = tree.indexOf(commitment);
const { pathElements, pathIndices } = tree.proof(index); // matches the circuit
const root = tree.root();
```

Mirrors `MerkleTreeWithHistory.sol`: insertion‑order leaves, precomputed `zeros` for empty
subtrees, `parent = Poseidon(left, right)`.

## Privacy Pool (fixed denomination)

```ts
import { PoolNote, MerkleTree } from "@privashh/sdk";
import { generatePoolWithdraw } from "@privashh/sdk/node";

// 1. Create a note and deposit its commitment on-chain.
const note = new PoolNote();                 // random nullifier + secret — keep them safe
const commitment = await note.commitment();  // = Poseidon(nullifier, secret)

// 2. Rebuild the trees from chain state (all deposits = state tree;
//    the ASP's approved subset = association tree).
const stateTree = await MerkleTree.create(allDepositCommitments);
const associationTree = await MerkleTree.create(approvedCommitments);

// 3. Prove + withdraw (gasless via a relayer: bind `relayer`/`fee` into the proof).
const { proof, stateRoot, associationRoot, nullifierHash } = await generatePoolWithdraw({
  note,
  stateTree,
  associationTree,
  recipient: BigInt(recipientAddress),
  relayer: BigInt(relayerAddress),
  fee,
  refund: 0n,
  wasmPath: "poolWithdraw.wasm",
  zkeyPath: "poolWithdraw.zkey",
});
// submit proof.{a,b,c} + stateRoot/associationRoot/nullifierHash to PrivacyPool.withdraw(...)
```

Browser variant — build the witness with the default entry and prove in a Worker:

```ts
import { buildPoolWithdrawInput } from "@privashh/sdk";
const { input } = await buildPoolWithdrawInput({ note, stateTree, associationTree, /* … */ });
// worker: const { proof } = await snarkjs.groth16.fullProve(input, wasmUrl, zkeyUrl)
```

## Shielded Pool (UTXO join‑split)

```ts
import { Keypair, Utxo, MerkleTree } from "@privashh/sdk";
import { generateTransaction } from "@privashh/sdk/node";

const keypair = await Keypair.generate();
const output = new Utxo({ amount: 10n ** 17n, keypair });

const { proof, extData, root, publicAmount, inputNullifiers, outputCommitments } =
  await generateTransaction({
    inputs: [],            // spent notes (padded to 2)
    outputs: [output],     // new notes (padded to 2)
    tree,                  // current commitment tree
    extAmount: 10n ** 17n, // signed: > 0 deposit, < 0 withdraw
    fee: 0n,
    recipient: "0x0000000000000000000000000000000000000000",
    relayer: "0x0000000000000000000000000000000000000000",
    wasmPath: "transaction2x2.wasm",
    zkeyPath: "transaction2x2.zkey",
  });
```

Helpers: `hashExtData(extData)` (= `keccak256(abi.encode(extData)) mod p`, matches
`ShieldedPool._extDataHash`) and `toFieldAmount(value)`.

## Notes

- Field/hash scheme (Poseidon, BN254, depth‑20 trees) is fixed and verified byte‑for‑byte
  equal across circuits ⇄ contracts ⇄ SDK. Don't mix artifacts from different setups.
- `formatProof` reorders a snarkjs proof into the `(a, b, c)` shape the Solidity verifier expects.
- ⚠️ The development trusted setup (the `.wasm` / `.zkey` you feed the prover) is
  single‑contributor and **must not secure real funds**.
