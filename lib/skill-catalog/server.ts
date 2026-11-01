/** Server-only access to the committed catalog index and the curated skills. */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { getKitSkills, type SkillGroup } from "@/lib/kit/skills";
import type { CatalogIndex, CatalogSkill, DomainId } from "./domains";

const GROUP_DOMAIN: Record<SkillGroup, DomainId> = {
  "Security & governance": "security",
  "Discover & plan": "product",
  Design: "design",
  Build: "backend",
  "Test & QA": "testing",
  "Deploy & docs": "devops",
};

export async function getCatalogIndex(): Promise<CatalogIndex> {
  const file = path.join(process.cwd(), "public", "skill-catalog", "index.json");
  return JSON.parse(await readFile(file, "utf8")) as CatalogIndex;
}

/** The in-house skills, shaped as catalog entries so the explorer can list them alongside the rest. */
export async function getCuratedCatalogSkills(): Promise<CatalogSkill[]> {
  return (await getKitSkills()).map((s) => ({
    id: `curated:${s.slug}`,
    name: s.skillName,
    title: s.name,
    description: s.description,
    domain: GROUP_DOMAIN[s.group],
    source: "curated",
    category: s.group,
    path: s.slug,
    license: "Internal",
    copyable: true,
    version: s.version,
  }));
}
