// Re-export the Solidity verifier (and vkey) from each EXISTING per-circuit _final.zkey, so the
// committed verifiers/*.sol always match the zkey used for proving. Use this when a verifier and
// its zkey have drifted out of sync (e.g. the zkey was regenerated without re-exporting the
// verifier). Unlike setup.mjs this runs NO new trusted setup — the proving key is left untouched,
// only the verifier contract + vkey JSON are regenerated from it.
import * as snarkjs from "snarkjs";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const config = JSON.parse(readFileSync(join(root, "circuits.config.json"), "utf8"));
const keysDir = join(root, "keys");
const verifierDir = resolve(root, "../contracts/contracts/verifiers");

const solTemplate = readFileSync(
  resolve(root, "node_modules/snarkjs/templates/verifier_groth16.sol.ejs"),
  "utf8",
);

for (const circuit of config.circuits) {
  const zkeyFinal = join(keysDir, `${circuit.name}_final.zkey`);
  if (!existsSync(zkeyFinal)) throw new Error(`missing ${zkeyFinal} — run setup first`);

  const vkey = await snarkjs.zKey.exportVerificationKey(zkeyFinal);
  writeFileSync(join(keysDir, `${circuit.name}_vkey.json`), JSON.stringify(vkey, null, 2));

  let verifier = await snarkjs.zKey.exportSolidityVerifier(zkeyFinal, { groth16: solTemplate });
  verifier = verifier.replace(/contract\s+Groth16Verifier/g, `contract ${circuit.verifier}`);
  writeFileSync(join(verifierDir, `${circuit.verifier}.sol`), verifier);
  console.log(`re-exported verifiers/${circuit.verifier}.sol from keys/${circuit.name}_final.zkey`);
}

console.log("verifier re-export complete.");
process.exit(0);
