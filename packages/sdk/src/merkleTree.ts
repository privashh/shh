import { LEVELS, ZERO_VALUE } from "./constants";
import { poseidon } from "./poseidon";

export interface MerklePath {
  /** sibling hash at each level (length = levels) */
  pathElements: bigint[];
  /** leaf index whose bits select left/right at each level (matches the circuit) */
  pathIndices: bigint;
}

/**
 * Fixed-depth Poseidon Merkle tree mirroring `MerkleTreeWithHistory.sol`:
 * leaves are appended in insertion order, empty subtrees use the precomputed `zeros`,
 * and `parent = Poseidon(left, right)`.
 */
export class MerkleTree {
  readonly levels: number;
  readonly zeros: bigint[];
  private leaves: bigint[];
  private layers: bigint[][];

  private constructor(levels: number, zeros: bigint[]) {
    this.levels = levels;
    this.zeros = zeros;
    this.leaves = [];
    this.layers = [];
  }

  static async create(leaves: bigint[] = [], levels: number = LEVELS): Promise<MerkleTree> {
    const zeros: bigint[] = [ZERO_VALUE];
    for (let i = 1; i <= levels; i++) {
      zeros.push(await poseidon([zeros[i - 1], zeros[i - 1]]));
    }
    const tree = new MerkleTree(levels, zeros);
    tree.leaves = leaves.slice();
    await tree.rebuild();
    return tree;
  }

  private async rebuild(): Promise<void> {
    this.layers = [this.leaves.slice()];
    for (let level = 0; level < this.levels; level++) {
      const current = this.layers[level];
      const next: bigint[] = [];
      for (let i = 0; i < current.length; i += 2) {
        const left = current[i];
        const right = i + 1 < current.length ? current[i + 1] : this.zeros[level];
        next.push(await poseidon([left, right]));
      }
      this.layers.push(next);
    }
  }

  async insert(leaf: bigint): Promise<number> {
    const index = this.leaves.length;
    this.leaves.push(leaf);
    await this.rebuild();
    return index;
  }

  indexOf(leaf: bigint): number {
    return this.leaves.findIndex((l) => l === leaf);
  }

  root(): bigint {
    const top = this.layers[this.levels];
    return top.length > 0 ? top[0] : this.zeros[this.levels];
  }

  /** Inclusion path for the leaf at `index`. */
  proof(index: number): MerklePath {
    if (index < 0 || index >= this.leaves.length)
      throw new Error(`leaf index ${index} out of range`);
    const pathElements: bigint[] = [];
    let bits = 0n;
    let idx = index;
    for (let level = 0; level < this.levels; level++) {
      const layer = this.layers[level];
      const isRight = idx % 2; // 1 ⇒ current node is the right child
      const siblingIndex = isRight ? idx + 1 : idx - 1;
      const sibling = siblingIndex < layer.length ? layer[siblingIndex] : this.zeros[level];
      pathElements.push(sibling);
      if (isRight) bits |= 1n << BigInt(level);
      idx = Math.floor(idx / 2);
    }
    return { pathElements, pathIndices: bits };
  }
}
