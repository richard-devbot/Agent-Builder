/**
 * Skill filter groups — a pure, dependency-free module so the client kit
 * builder can import the group list and type without pulling in the
 * server-only skill loader (which reads the filesystem).
 */

export const SKILL_GROUPS = [
  "Security & governance",
  "Discover & plan",
  "Design",
  "Build",
  "Test & QA",
  "Deploy & docs",
] as const;

export type SkillGroup = (typeof SKILL_GROUPS)[number];
