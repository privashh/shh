import { privacyPool, relayerSigner } from "@/lib/chain";
import { getConfig } from "@/lib/config";

export const runtime = "nodejs";

interface WithdrawBody {
  a: [string, string];
  b: [[string, string], [string, string]];
  c: [string, string];
  stateRoot: string;
  associationRoot: string;
  nullifierHash: string;
  recipient: string;
  fee: string;
  refund: string;
}

// Submit a Privacy Pool withdrawal on the user's behalf (gasless for the user). The proof
// must be generated with `relayer` bound to this relayer's address (see GET /api/config),
// otherwise on-chain verification rejects it.
export async function POST(req: Request) {
  let body: WithdrawBody;
  try {
    body = (await req.json()) as WithdrawBody;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  // `fee` and `refund` are bound into the proof, so the relayer cannot silently rewrite
  // them — it can only refuse to serve requests that violate its policy.
  let fee: bigint;
  let refund: bigint;
  try {
    fee = BigInt(body.fee);
    refund = BigInt(body.refund);
  } catch {
    return Response.json({ error: "fee and refund must be integer strings" }, { status: 400 });
  }

  // This is an ETH pool: a non-zero `refund` would be paid to the recipient out of the
  // relayer's own balance with no reimbursement (the relayer is paid by `fee`, not `refund`).
  // Refuse it outright so the relayer can never be drained by an attacker-chosen refund.
  if (refund !== 0n) {
    return Response.json(
      { error: "relayer only serves refund-free withdrawals (refund must be 0)" },
      { status: 400 },
    );
  }

  // Require at least the relayer's advertised fee so it is compensated for the gas it fronts.
  const cfg = getConfig();
  const minFee = (BigInt(cfg.denomination) * BigInt(cfg.relayer.feeBps)) / 10000n;
  if (fee < minFee) {
    return Response.json(
      { error: `fee below relayer minimum (${minFee})` },
      { status: 400 },
    );
  }

  try {
    const signer = relayerSigner();
    const relayerAddress = await signer.getAddress();
    const pool = privacyPool(signer);

    const tx = await pool.withdraw(
      body.a,
      body.b,
      body.c,
      body.stateRoot,
      body.associationRoot,
      body.nullifierHash,
      body.recipient,
      relayerAddress,
      body.fee,
      body.refund,
      { value: body.refund },
    );
    const receipt = await tx.wait();
    return Response.json({
      txHash: receipt?.hash ?? tx.hash,
      relayer: relayerAddress,
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
