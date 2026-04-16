import path from "node:path";

// Circuit build artifacts produced by `pnpm circuits:compile && pnpm circuits:setup`.
const circuits = path.resolve(__dirname, "../../../circuits");

export const POOL_WASM = path.join(
  circuits,
  "build",
  "poolWithdraw",
  "poolWithdraw_js",
  "poolWithdraw.wasm",
);
export const POOL_ZKEY = path.join(circuits, "keys", "poolWithdraw_final.zkey");

export const TX_WASM = path.join(
  circuits,
  "build",
  "transaction2x2",
  "transaction2x2_js",
  "transaction2x2.wasm",
);
export const TX_ZKEY = path.join(circuits, "keys", "transaction2x2_final.zkey");
