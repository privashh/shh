// Groth16 trusted setup for every compiled circuit:
//   download Powers of Tau → newZKey → contribute (dev entropy) → export vkey +
//   Solidity verifier into packages/contracts/contracts/verifiers/.
//
// The single-contributor contribution here is for DEVELOPMENT ONLY. Production
// requires a multi-party ceremony (see docs/workflow.md Phase 8).
import * as snarkjs from "snarkjs";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { randomBytes } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const config = JSON.parse(readFileSync(join(root, "circuits.config.json"), "utf8"));

const buildDir = join(root, "build");
const keysDir = join(root, "keys");
const ptauDir = join(root, "ptau");
const verifierDir = resolve(root, "../contracts/contracts/verifiers");
for (const d of [keysDir, ptauDir, verifierDir]) mkdirSync(d, { recursive: true });

// 1. Powers of Tau
const ptauPath = join(ptauDir, `pot${config.ptau.power}_final.ptau`);
if (!existsSync(ptauPath)) {
  console.log(`Downloading Powers of Tau (2^${config.ptau.power}) …`);
  const res = await fetch(config.ptau.url);
  if (!res.ok || !res.body) throw new Error(`ptau download failed: ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(ptauPath));
  console.log("  → saved", ptauPath);
}

const solTemplate = readFileSync(
  resolve(root, "node_modules/snarkjs/templates/verifier_groth16.sol.ejs"),
  "utf8"
);

// 2. Per-circuit Groth16 setup
for (const circuit of config.circuits) {
  console.log(`\n=== setup ${circuit.name} ===`);
  const r1cs = join(buildDir, circuit.name, `${circuit.name}.r1cs`);
  if (!existsSync(r1cs)) throw new Error(`missing ${r1cs} — run compile first`);

  const zkey0 = join(keysDir, `${circuit.name}_0000.zkey`);
  const zkeyFinal = join(keysDir, `${circuit.name}_final.zkey`);
  const vkeyPath = join(keysDir, `${circuit.name}_vkey.json`);

  await snarkjs.zKey.newZKey(r1cs, ptauPath, zkey0);
  await snarkjs.zKey.contribute(
    zkey0,
    zkeyFinal,
    "shh-dev-contribution-1",
    randomBytes(32).toString("hex")
  );

  const vkey = await snarkjs.zKey.exportVerificationKey(zkeyFinal);
  writeFileSync(vkeyPath, JSON.stringify(vkey, null, 2));

  let verifier = await snarkjs.zKey.exportSolidityVerifier(zkeyFinal, {
    groth16: solTemplate,
  });
  verifier = verifier.replace(/contract\s+Groth16Verifier/g, `contract ${circuit.verifier}`);
  writeFileSync(join(verifierDir, `${circuit.verifier}.sol`), verifier);
  console.log(`  → keys/${circuit.name}_final.zkey + verifiers/${circuit.verifier}.sol`);
}

console.log("\nTrusted setup complete.");
// snarkjs leaves worker threads open; exit explicitly.
process.exit(0);
