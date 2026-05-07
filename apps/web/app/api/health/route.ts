export const runtime = "nodejs";

export async function GET() {
  return Response.json({
    status: "ok",
    service: "shh-wallet-backend",
    time: new Date().toISOString(),
  });
}
