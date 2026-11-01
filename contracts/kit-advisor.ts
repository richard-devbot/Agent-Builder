/**
 * Shared request/response contract for the kit-advisor Lambda.
 *
 * Imported by BOTH sides of the wire so they cannot drift:
 *   - UI client:      lib/kit/kit-advisor-client.ts (future)
 *   - Lambda handler: backend/kit-advisor/index.ts
 */

import { z } from "zod";

export const KitAdvisorRequestSchema = z.object({
  technologies: z.array(z.string().min(1)).max(50),
  projectType: z.string().max(100).optional(),
  /** Wizard question answers, keyed by question id. */
  answers: z.record(z.string(), z.string().max(2_000)).optional(),
  /** The generated instruction-file draft (e.g. CLAUDE.md) to review. */
  draftMarkdown: z.string().min(1).max(200_000),
});

export const KitAdvisorSuggestionSchema = z.object({
  title: z.string().min(1),
  detail: z.string().min(1),
  severity: z.enum(["info", "recommended", "important"]),
});

export const KitAdvisorResponseSchema = z.object({
  advice: z.object({
    suggestions: z.array(KitAdvisorSuggestionSchema).max(20),
    /** Wizard questions the user left unanswered that matter for this stack. */
    missingAnswers: z.array(z.string().min(1)).max(20),
  }),
});

export type KitAdvisorRequest = z.infer<typeof KitAdvisorRequestSchema>;
export type KitAdvisorSuggestion = z.infer<typeof KitAdvisorSuggestionSchema>;
export type KitAdvisorResponse = z.infer<typeof KitAdvisorResponseSchema>;
