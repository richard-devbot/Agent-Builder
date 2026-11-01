import { AnalyzeRequestSchema } from "@/contracts/intake";
import { IntakeModelError, generateStructured, intakeStatus } from "@/lib/intake/gemini";
import { guidedAnalyze } from "@/lib/intake/guided";
import { ANALYZE_SYSTEM, AnalyzeModelSchema, analyzePrompt, normalizeAnalyze } from "@/lib/intake/prompts";
import { json, readBody } from "@/lib/intake/route-utils";

export const dynamic = "force-dynamic";

/** Material Analyst: read newly shared materials and fold their facts into the brief. */
export async function POST(req: Request) {
  const body = await readBody(req, AnalyzeRequestSchema);
  if (body instanceof Response) return body;
  if (!intakeStatus().configured) return json(guidedAnalyze(body));
  try {
    const out = await generateStructured(AnalyzeModelSchema, ANALYZE_SYSTEM, analyzePrompt(body));
    return json(normalizeAnalyze(out, body.analyze));
  } catch (e) {
    console.error("[intake/analyze]", e);
    const message = e instanceof IntakeModelError ? e.message : "The AI service is unavailable right now";
    return json({ error: message }, 502);
  }
}
