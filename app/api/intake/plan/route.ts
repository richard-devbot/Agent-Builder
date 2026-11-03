import { PlanRequestSchema, type PlanResponse } from "@/contracts/intake";
import { IntakeModelError, generateStructured, intakeStatus } from "@/lib/intake/gemini";
import { guidedPlan } from "@/lib/intake/guided";
import { ALLOWED_TECH, TECH_PROMPT_LIST, guidedNeeds, matchSkills, techFromBrief } from "@/lib/intake/plan-support";
import { PlanModelSchema, normalizePlan, planPrompt, planSystem } from "@/lib/intake/prompts";
import { json, readBody } from "@/lib/intake/route-utils";

export const dynamic = "force-dynamic";

/** Solution plan from the brief: stack, milestones, catalog skills and draft custom agents/skills. */
export async function POST(req: Request) {
  const body = await readBody(req, PlanRequestSchema);
  if (body instanceof Response) return body;
  if (!intakeStatus().configured) {
    const res: PlanResponse = { plan: guidedPlan(techFromBrief(body.brief), await matchSkills(guidedNeeds(body.brief))), mode: "guided" };
    return json(res);
  }
  try {
    const out = await generateStructured(PlanModelSchema, planSystem(TECH_PROMPT_LIST), planPrompt(body), 16_384, 120_000);
    const res: PlanResponse = { plan: normalizePlan(out, ALLOWED_TECH, await matchSkills(out.skillNeeds)), mode: "ai" };
    return json(res);
  } catch (e) {
    console.error("[intake/plan]", e);
    const message = e instanceof IntakeModelError ? e.message : "The AI service is unavailable right now";
    return json({ error: message }, 502);
  }
}
