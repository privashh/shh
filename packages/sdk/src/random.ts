import { FIELD_SIZE } from "./constants";

/** A uniformly random field element (31 bytes < field, then reduced). Isomorphic: uses Web
 * Crypto, available as `globalThis.crypto` in browsers and Node 20+. */
export function randomField(): bigint {
  const bytes = new Uint8Array(31);
  globalThis.crypto.getRandomValues(bytes);
  let hex = "0x";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return BigInt(hex) % FIELD_SIZE;
}
