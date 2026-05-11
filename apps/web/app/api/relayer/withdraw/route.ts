import { privacyPool, relayerSigner } from "@/lib/chain";

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
