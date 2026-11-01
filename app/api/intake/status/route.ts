import { intakeStatus } from "@/lib/intake/gemini";
import { json } from "@/lib/intake/route-utils";

// Reads credentials at request time, never at build time.
export const dynamic = "force-dynamic";

export function GET() {
  return json(intakeStatus());
}
