/**
 * Client for the kit-advisor Lambda (backend/kit-advisor).
 *
 * The endpoint is injected at build time via NEXT_PUBLIC_KIT_ADVISOR_API.
 * When unset the feature is shown disabled and the site stays fully static.
 */

import {
  KitAdvisorResponseSchema,
  type KitAdvisorRequest,
  type KitAdvisorResponse,
} from "@/contracts/kit-advisor";

export type { KitAdvisorRequest };
export type KitAdvice = KitAdvisorResponse["advice"];

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";
const ENV = process.env.NEXT_PUBLIC_ENV ?? "dev";

export const KIT_ADVISOR_API =
  process.env.NEXT_PUBLIC_KIT_ADVISOR_API ??
  (API_BASE ? `${API_BASE.replace(/\/$/, "")}/${ENV}/kit-advisor` : "");

export async function adviseKit(req: KitAdvisorRequest): Promise<KitAdvice> {
  const res = await fetch(KIT_ADVISOR_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // keep default message
    }
    throw new Error(message);
  }
  return KitAdvisorResponseSchema.parse(await res.json()).advice;
}
