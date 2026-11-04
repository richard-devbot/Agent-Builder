import { intakeStatus } from "@/lib/intake/gemini";
import { json, requireApiSession } from "@/lib/intake/route-utils";

// Reads credentials at request time, never at build time.
export const dynamic = "force-dynamic";

export async function GET() {
  const sessionOrRes = await requireApiSession();
  if (sessionOrRes instanceof Response) return sessionOrRes;
  return json(intakeStatus());
}
