// End-to-end Privacy Pool check against a LIVE shh L3:
//   deposit -> wait for the ASP to publish the association root -> prove (local zkey) ->
//   withdraw via the relayer backend -> assert the recipient was paid and the nullifier spent.
//
// Run locally (the proving artifacts live here, not on the chain host):
//   E2E_PRIVATE_KEY=<funded depositor> \
//   node packages/contracts/scripts/e2e-pool.js
//
// Env (all optional except E2E_PRIVATE_KEY):
//   SHH_RPC_URL, PRIVACY_POOL_ADDRESS, ASP_ADDRESS, RELAYER_ADDRESS, BACKEND_URL
const { JsonRpcProvider, Wallet, Contract, formatEther } = require("ethers");
const { PoolNote, MerkleTree, LEVELS, toFixedHex } = require("@privashh/sdk");
const { generatePoolWithdraw } = require("@privashh/sdk/node");
const path = require("node:path");

const RPC = process.env.SHH_RPC_URL || "https://rpc.shh.gg";
const POOL = process.env.PRIVACY_POOL_ADDRESS || "0x06f7F1539030D116AecCC7a32eF35D71b572dc3c";
const ASP = process.env.ASP_ADDRESS || "0x37C5550c8baF1015f0a469b7C4d6D63065965aeF";
const RELAYER = process.env.RELAYER_ADDRESS || "0x14fb6801702342d7dB3E10A050A4604ae3EDc03D";
const BACKEND = process.env.BACKEND_URL || "http://localhost:3007";
const KEY = process.env.E2E_PRIVATE_KEY;
if (!KEY) throw new Error("E2E_PRIVATE_KEY (a funded depositor) is required");

const WASM = path.resolve(__dirname, "../../circuits/build/poolWithdraw/poolWithdraw_js/poolWithdraw.wasm");
const ZKEY = path.resolve(__dirname, "../../circuits/keys/poolWithdraw_final.zkey");

const POOL_ABI = [
  "event Deposit(bytes32 indexed commitment, uint32 leafIndex, uint256 timestamp)",
  "function deposit(bytes32 commitment) payable",
  "function denomination() view returns (uint256)",
  "function nullifierHashes(bytes32) view returns (bool)",
];
const ASP_ABI = ["function currentRoot() view returns (uint256)"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function allCommitments(pool) {
  const ev = await pool.queryFilter(pool.filters.Deposit(), 0, "latest");
  return ev
    .map((e) => ({ c: BigInt(e.args.commitment), i: Number(e.args.leafIndex) }))
    .sort((a, b) => a.i - b.i)
    .map((x) => x.c);
}

async function main() {
  const provider = new JsonRpcProvider(RPC);
  const depositor = new Wallet(KEY, provider);
  const pool = new Contract(POOL, POOL_ABI, depositor);
  const asp = new Contract(ASP, ASP_ABI, provider);

  const denom = await pool.denomination();
  console.log(`depositor ${depositor.address} balance ${formatEther(await provider.getBalance(depositor.address))} ETH`);
  console.log(`denomination ${formatEther(denom)} ETH`);

  // 1. deposit a fresh note
  const note = new PoolNote();
  const commitment = await note.commitment();
  console.log(`\n[1] deposit commitment ${toFixedHex(commitment)}`);
  const dep = await pool.deposit(toFixedHex(commitment), { value: denom });
  const depRcpt = await dep.wait();
  console.log(`    deposited in block ${depRcpt.blockNumber}, tx ${depRcpt.hash}`);

  // 2. wait for the ASP publisher to publish a root covering our commitment
  console.log(`\n[2] waiting for the ASP to publish the association root…`);
  let stateTree, assocTree, expectedRoot;
  for (let i = 0; i < 30; i++) {
    const leaves = await allCommitments(pool);
    stateTree = await MerkleTree.create(leaves, LEVELS);
    assocTree = await MerkleTree.create(leaves, LEVELS); // open-pool: association set = all deposits
    expectedRoot = assocTree.root();
    const current = await asp.currentRoot();
    if (current === expectedRoot) {
      console.log(`    published root ${toFixedHex(expectedRoot)} (after ${i * 2}s)`);
      break;
    }
    await sleep(2000);
    if (i === 29) throw new Error("timed out waiting for ASP root");
  }

  // 3. prove the withdrawal (recipient = fresh address; relayer = backend relayer)
  const recipient = Wallet.createRandom().address;
  const fee = (denom * 50n) / 10000n; // matches the relayer's advertised feeBps (50)
  console.log(`\n[3] proving withdrawal -> recipient ${recipient}, fee ${formatEther(fee)} ETH`);
  const res = await generatePoolWithdraw({
    note,
    stateTree,
    associationTree: assocTree,
    recipient: BigInt(recipient),
    relayer: BigInt(RELAYER),
    fee,
    refund: 0n,
    wasmPath: WASM,
    zkeyPath: ZKEY,
  });

  // 4. submit via the relayer backend
  console.log(`\n[4] POST ${BACKEND}/api/relayer/withdraw`);
  const body = {
    a: res.proof.a.map(String),
    b: res.proof.b.map((row) => row.map(String)),
    c: res.proof.c.map(String),
    stateRoot: toFixedHex(res.stateRoot),
    associationRoot: toFixedHex(res.associationRoot),
    nullifierHash: toFixedHex(res.nullifierHash),
    recipient,
    fee: fee.toString(),
    refund: "0",
  };
  const r = await fetch(`${BACKEND}/api/relayer/withdraw`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const out = await r.json();
  console.log(`    relayer response ${r.status}:`, out);
  if (!r.ok) throw new Error("relayer rejected the withdrawal");

  // 5. assert
  console.log(`\n[5] verifying…`);
  const recipBal = await provider.getBalance(recipient);
  const spent = await pool.nullifierHashes(toFixedHex(res.nullifierHash));
  console.log(`    recipient balance ${formatEther(recipBal)} ETH (expected ${formatEther(denom - fee)})`);
  console.log(`    nullifier spent: ${spent}`);
  if (recipBal !== denom - fee) throw new Error("recipient balance mismatch");
  if (!spent) throw new Error("nullifier not marked spent");
  console.log(`\n✅ e2e OK: deposit -> ASP publish -> prove -> relayer withdraw`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("\n❌ e2e failed:", e.message || e);
  process.exit(1);
});
