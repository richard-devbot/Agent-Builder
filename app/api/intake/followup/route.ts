import { FollowUpRequestSchema } from "@/contracts/intake";
import { IntakeModelError, generateStructured, intakeStatus } from "@/lib/intake/gemini";
import { guidedFollowUp } from "@/lib/intake/guided";
import { FOLLOWUP_SYSTEM, FollowUpModelSchema, followUpPrompt, normalizeFollowUp } from "@/lib/intake/prompts";
import { json, readBody } from "@/lib/intake/route-utils";

export const dynamic = "force-dynamic";

/** One follow-up round: updated brief + next questions. Falls back to guided mode without Gemini. */
export async function POST(req: Request) {
  const body = await readBody(req, FollowUpRequestSchema);
  if (body instanceof Response) return body;
  if (!intakeStatus().configured) return json(guidedFollowUp(body));
  try {
    const out = await generateStructured(FollowUpModelSchema, FOLLOWUP_SYSTEM, followUpPrompt(body));
    return json(normalizeFollowUp(out, body.round, body.asked));
  } catch (e) {
    console.error("[intake/followup]", e);
    const message = e instanceof IntakeModelError ? e.message : "The AI service is unavailable right now";
    return json({ error: message }, 502);
  }
}
