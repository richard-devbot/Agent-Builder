/** Browser client for /api/intake/*. Falls back to guided mode when the API can't be reached. */

import {
  AnalyzeResponseSchema,
  FollowUpResponseSchema,
  IntakeStatusSchema,
  PlanResponseSchema,
  type AnalyzeRequest,
  type AnalyzeResponse,
  type FollowUpRequest,
  type FollowUpResponse,
  type IntakeContext,
  type IntakeStatus,
  type PlanResponse,
} from "@/contracts/intake";
import { guidedAnalyze, guidedFollowUp } from "./guided";
import { INSTRUCTIONS_VERSION } from "./instructions";

const OFFLINE: IntakeStatus = { configured: false, provider: "none", auth: "none", model: "", instructionsVersion: INSTRUCTIONS_VERSION };

async function post(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

export async function getIntakeStatus(): Promise<IntakeStatus> {
  try {
    const res = await fetch("/api/intake/status");
    return res.ok ? IntakeStatusSchema.parse(await res.json()) : OFFLINE;
  } catch {
    return OFFLINE;
  }
}

/** Server errors (bad model output, rate limit) surface to the user; a missing API falls back to guided mode. */
export async function requestFollowUp(req: FollowUpRequest): Promise<FollowUpResponse> {
  try {
    return FollowUpResponseSchema.parse(await post("/api/intake/followup", req));
  } catch (e) {
    if (e instanceof TypeError) return guidedFollowUp(req);
    throw e;
  }
}

export async function requestAnalyze(req: AnalyzeRequest): Promise<AnalyzeResponse> {
  try {
    return AnalyzeResponseSchema.parse(await post("/api/intake/analyze", req));
  } catch (e) {
    if (e instanceof TypeError) return guidedAnalyze(req);
    throw e;
  }
}

export async function requestPlan(ctx: IntakeContext): Promise<PlanResponse> {
  return PlanResponseSchema.parse(await post("/api/intake/plan", ctx));
}

/** Keep each material within the contract limit; returns the text and whether it was cut. */
export const MATERIAL_CHARS = 30_000;
export function clipMaterial(text: string): { text: string; truncated: boolean } {
  const clean = text.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return clean.length > MATERIAL_CHARS ? { text: clean.slice(0, MATERIAL_CHARS), truncated: true } : { text: clean, truncated: false };
}
