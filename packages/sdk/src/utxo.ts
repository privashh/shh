import { AbiCoder, keccak256 } from "ethers";
import { FIELD_SIZE } from "./constants";
import { MerkleTree } from "./merkleTree";
import { poseidon } from "./poseidon";
import { randomField } from "./random";

/** Spend key: pubkey = Poseidon(privkey); sign = Poseidon(privkey, commitment, path). */
export class Keypair {
  readonly privkey: bigint;
  pubkey!: bigint;

  constructor(privkey: bigint = randomField()) {
    this.privkey = privkey;
  }

  async init(): Promise<this> {
    this.pubkey = await poseidon([this.privkey]);
    return this;
  }

  static generate(privkey?: bigint): Promise<Keypair> {
    return new Keypair(privkey).init();
  }

  sign(commitment: bigint, merklePath: bigint): Promise<bigint> {
    return poseidon([this.privkey, commitment, merklePath]);
  }
}

/** A shielded note: commitment = Poseidon(amount, pubkey, blinding). */
export class Utxo {
  amount: bigint;
  blinding: bigint;
  keypair: Keypair;
  index: number | null;

  constructor(opts: {
    amount?: bigint;
    keypair: Keypair;
    blinding?: bigint;
    index?: number | null;
  }) {
    this.amount = opts.amount ?? 0n;
    this.keypair = opts.keypair;
    this.blinding = opts.blinding ?? randomField();
    this.index = opts.index ?? null;
  }

  getCommitment(): Promise<bigint> {
    return poseidon([this.amount, this.keypair.pubkey, this.blinding]);
  }

  async getNullifier(): Promise<bigint> {
    const commitment = await this.getCommitment();
    const merklePath = BigInt(this.index ?? 0);
    const signature = await this.keypair.sign(commitment, merklePath);
    return poseidon([commitment, merklePath, signature]);
  }
}

export interface ExtData {
  recipient: string;
  extAmount: bigint; // signed: > 0 deposit, < 0 withdraw
  relayer: string;
  fee: bigint;
  encryptedOutput1: string;
  encryptedOutput2: string;
}

const EXT_DATA_TUPLE =
  "tuple(address recipient,int256 extAmount,address relayer,uint256 fee,bytes encryptedOutput1,bytes encryptedOutput2)";

/** keccak256(abi.encode(extData)) mod p — matches ShieldedPool._extDataHash. */
export function hashExtData(extData: ExtData): bigint {
  const encoded = AbiCoder.defaultAbiCoder().encode([EXT_DATA_TUPLE], [extData]);
  return BigInt(keccak256(encoded)) % FIELD_SIZE;
}

/** (value) mod p, mapping negatives into the field — matches _calcPublicAmount. */
export function toFieldAmount(value: bigint): bigint {
  return ((value % FIELD_SIZE) + FIELD_SIZE) % FIELD_SIZE;
}

export interface TransactionInputParams {
  inputs: Utxo[];
  outputs: Utxo[];
  tree: MerkleTree;
  extAmount: bigint;
  fee: bigint;
  recipient: string;
  relayer: string;
  encryptedOutputs?: [string, string];
}

export interface TransactionInput {
  input: Record<string, unknown>;
  root: bigint;
  publicAmount: bigint;
  extDataHash: bigint;
  inputNullifiers: [bigint, bigint];
  outputCommitments: [bigint, bigint];
  extData: ExtData;
}

async function padTo2(notes: Utxo[], inTree: boolean): Promise<Utxo[]> {
  const padded = notes.slice();
  while (padded.length < 2) {
    // distinct dummy keypairs ⇒ distinct nullifiers (the circuit forbids duplicates)
    padded.push(
      new Utxo({
        amount: 0n,
        keypair: await Keypair.generate(),
        index: inTree ? 0 : null,
      }),
    );
  }
  if (padded.length !== 2) throw new Error("only 2-in/2-out transactions are supported");
  return padded;
}

/**
 * Build the circuit witness input for a 2-in/2-out shielded transaction (browser-safe — no
 * proving). Feed `input` to a Groth16 prover.
 */
export async function buildTransactionInput(
  params: TransactionInputParams,
): Promise<TransactionInput> {
  const inputs = await padTo2(params.inputs, true);
  const outputs = await padTo2(params.outputs, false);

  const root = params.tree.root();
  const publicAmount = toFieldAmount(params.extAmount - params.fee);

  const enc = params.encryptedOutputs ?? ["0x", "0x"];
  const extData: ExtData = {
    recipient: params.recipient,
    extAmount: params.extAmount,
    relayer: params.relayer,
    fee: params.fee,
    encryptedOutput1: enc[0],
    encryptedOutput2: enc[1],
  };
  const extDataHash = hashExtData(extData);

  const inAmount: bigint[] = [];
  const inPrivateKey: bigint[] = [];
  const inBlinding: bigint[] = [];
  const inPathIndices: bigint[] = [];
  const inPathElements: bigint[][] = [];
  const inputNullifiers: bigint[] = [];

  for (const input of inputs) {
    inAmount.push(input.amount);
    inPrivateKey.push(input.keypair.privkey);
    inBlinding.push(input.blinding);
    if (input.amount > 0n) {
      if (input.index === null) {
        const commitment = await input.getCommitment();
        input.index = params.tree.indexOf(commitment);
        if (input.index < 0) throw new Error("input note not found in tree");
      }
      const path = params.tree.proof(input.index);
      inPathIndices.push(path.pathIndices);
      inPathElements.push(path.pathElements);
    } else {
      inPathIndices.push(0n);
      inPathElements.push(params.tree.zeros.slice(0, params.tree.levels));
    }
    inputNullifiers.push(await input.getNullifier());
  }

  const outAmount: bigint[] = [];
  const outPubkey: bigint[] = [];
  const outBlinding: bigint[] = [];
  const outputCommitments: bigint[] = [];
  for (const output of outputs) {
    outAmount.push(output.amount);
    outPubkey.push(output.keypair.pubkey);
    outBlinding.push(output.blinding);
    outputCommitments.push(await output.getCommitment());
  }

  const input = {
    root,
    publicAmount,
    extDataHash,
    inputNullifier: inputNullifiers,
    outputCommitment: outputCommitments,
    inAmount,
    inPrivateKey,
    inBlinding,
    inPathIndices,
    inPathElements,
    outAmount,
    outPubkey,
    outBlinding,
  };

  return {
    input,
    root,
    publicAmount,
    extDataHash,
    inputNullifiers: [inputNullifiers[0], inputNullifiers[1]],
    outputCommitments: [outputCommitments[0], outputCommitments[1]],
    extData,
  };
}
