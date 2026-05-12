// Copy compiled circuit artifacts (and the snarkjs browser bundle) into the web app's
// public/ so a future frontend can fetch them for client-side proving.
import { createRequire } from "node:module";
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const circuits = resolve(root, "packages/circuits");
const pub = resolve(root, "apps/web/public/circuits");
mkdirSync(pub, { recursive: true });

const copies = [
  ["build/poolWithdraw/poolWithdraw_js/poolWithdraw.wasm", "poolWithdraw.wasm"],
  ["keys/poolWithdraw_final.zkey", "poolWithdraw.zkey"],
  ["build/transaction2x2/transaction2x2_js/transaction2x2.wasm", "transaction2x2.wasm"],
  ["keys/transaction2x2_final.zkey", "transaction2x2.zkey"],
];

let missing = false;
for (const [src, dst] of copies) {
  const from = resolve(circuits, src);
  if (!existsSync(from)) {
    console.warn(`  ! missing ${src} — run \`pnpm setup\` first`);
    missing = true;
    continue;
  }
  cpSync(from, resolve(pub, dst));
  console.log(`  ✓ ${dst}`);
}

// snarkjs browser bundle (for the future client-side proving worker)
try {
  const requireFromCircuits = createRequire(resolve(circuits, "package.json"));
  // resolve the package entry, then take its sibling browser bundle (subpath exports are restricted)
  const snark = resolve(dirname(requireFromCircuits.resolve("snarkjs")), "snarkjs.min.js");
  if (!existsSync(snark)) throw new Error("not found");
  const vendor = resolve(root, "apps/web/public/vendor");
  mkdirSync(vendor, { recursive: true });
  cpSync(snark, resolve(vendor, "snarkjs.min.js"));
  console.log("  ✓ vendor/snarkjs.min.js");
} catch {
  console.warn("  ! snarkjs browser bundle not found (optional, for the future frontend)");
}

if (missing) process.exitCode = 1;
