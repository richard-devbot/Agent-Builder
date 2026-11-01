/**
 * Shared request/response contract for the author-skill Lambda.
 *
 * Imported by BOTH sides of the wire so they cannot drift:
 *   - UI client:      lib/kit/author-skill-client.ts
 *   - Lambda handler: backend/author-skill/index.ts
 */

import { z } from "zod";

export const MAX_DOC_CHARS = 200_000;

export const AuthorSkillRequestSchema = z.object({
  technologies: z.array(z.string().min(1)).max(50),
  projectName: z.string().max(200).optional(),
  notes: z.string().max(5_000).optional(),
  document: z.object({
    name: z.string().min(1).max(300),
    text: z.string().min(1).max(MAX_DOC_CHARS),
  }),
});

export const AuthorSkillResponseSchema = z.object({
  skill: z.object({
    /** kebab-case skill name from frontmatter. */
    name: z.string().min(1),
    /** One-line description from frontmatter. */
    description: z.string().min(1),
    /** Full SKILL.md content (frontmatter + body). */
    markdown: z.string().min(1),
  }),
});

export type AuthorSkillRequest = z.infer<typeof AuthorSkillRequestSchema>;
export type AuthorSkillResponse = z.infer<typeof AuthorSkillResponseSchema>;
