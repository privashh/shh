// Compile every circuit declared in circuits.config.json with circom.
// Outputs r1cs + wasm + sym into build/<name>/.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const config = JSON.parse(readFileSync(join(root, "circuits.config.json"), "utf8"));

const buildDir = join(root, "build");
const nodeModules = resolve(root, "node_modules"); // include search path for circomlib
const circom = process.env.CIRCOM || "circom";

for (const circuit of config.circuits) {
  const outDir = join(buildDir, circuit.name);
  mkdirSync(outDir, { recursive: true });

  console.log(`\n=== compiling ${circuit.name} ===`);
  execFileSync(
    circom,
    [
      join(root, circuit.main),
      "--r1cs",
      "--wasm",
      "--sym",
      "-o",
      outDir,
      "-l",
      nodeModules,
    ],
    { stdio: "inherit" }
  );
}

console.log("\nAll circuits compiled →", buildDir);
