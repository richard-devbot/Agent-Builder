/**
 * Client for the author-skill Lambda (backend/author-skill).
 *
 * The endpoint is injected at build time via NEXT_PUBLIC_AUTHOR_SKILL_API.
 * When unset the feature is hidden and the site stays fully static.
 */

import type { KitSkill } from "./skills";
import {
  AuthorSkillResponseSchema,
  type AuthorSkillRequest,
} from "@/contracts/author-skill";

export type { AuthorSkillRequest };

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";
const ENV = process.env.NEXT_PUBLIC_ENV ?? "dev";

export const AUTHOR_SKILL_API =
  process.env.NEXT_PUBLIC_AUTHOR_SKILL_API ??
  (API_BASE ? `${API_BASE.replace(/\/$/, "")}/${ENV}/auth-skills` : "");

/** Call the Lambda and project the result into the KitSkill shape. */
export async function authorSkill(
  req: AuthorSkillRequest,
): Promise<KitSkill> {
  const res = await fetch(AUTHOR_SKILL_API, {
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
  const { skill } = AuthorSkillResponseSchema.parse(await res.json());
  // The kit assembler emits its own frontmatter from name/description, so
  // keep only the body here to avoid duplicating it in the SKILL.md.
  const body = skill.markdown.replace(/^---\n[\s\S]*?\n---\n*/, "");
  return {
    slug: `authored:${skill.name}`,
    name: skill.name,
    skillName: skill.name,
    description: skill.description,
    recommendedFor: ["always"],
    group: "Build",
    body,
  };
}
