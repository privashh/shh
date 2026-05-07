import { getConfig } from "@/lib/config";

export const runtime = "nodejs";

export async function GET() {
  return Response.json(getConfig());
}
