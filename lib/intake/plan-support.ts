/** Server-side helpers for plans: technology resolution and catalog skill matching. */

import type { Brief, Plan } from "@/contracts/intake";
import { TECHNOLOGIES, TECH_BY_ID, resolveTechId } from "@/lib/kit/technologies";
import { getCatalogIndex, getCuratedCatalogSkills } from "@/lib/skill-catalog/server";
import { searchSkills } from "@/lib/skill-catalog/search";
import type { CatalogSkill } from "@/lib/skill-catalog/domains";

export const ALLOWED_TECH = new Set(TECHNOLOGIES.map((t) => t.id));
export const TECH_PROMPT_LIST = TECHNOLOGIES.map((t) => `${t.id} (${t.label})`).join(", ");

/** Technologies named anywhere in the brief's stack or integrations. */
export function techFromBrief(brief: Brief): string[] {
  const found = new Set<string>();
  for (const item of [...brief.stack, ...brief.integrations]) {
    const id = resolveTechId(item);
    if (TECH_BY_ID[id]) found.add(id);
    const text = ` ${item.toLowerCase()} `;
    for (const t of TECHNOLOGIES) {
      const names = [t.label, ...(t.aliases ?? [])].map((n) => n.toLowerCase());
      if (names.some((n) => n.length > 2 && text.includes(` ${n} `))) found.add(t.id);
    }
  }
  return [...found];
}

let pool: Promise<CatalogSkill[]> | null = null;
function catalogPool(): Promise<CatalogSkill[]> {
  pool ??= Promise.all([getCuratedCatalogSkills(), getCatalogIndex()]).then(([c, i]) => [...c, ...i.skills]);
  return pool;
}

/** Up to three catalog skills per need: curated first, then skills the kit can bundle. */
export async function matchSkills(needs: { need: string; query: string }[]): Promise<Plan["skills"]> {
  const skills = await catalogPool();
  const rank = (s: CatalogSkill) => (s.source === "curated" ? 0 : s.copyable ? 1 : 2);
  const taken = new Set<string>();
  const out: Plan["skills"] = [];
  for (const n of needs.slice(0, 8)) {
    let hits = searchSkills(skills, n.query);
    // Fall back to the strongest single keyword when the full phrase finds nothing.
    if (hits.length === 0) {
      const words = n.query.split(/\s+/).filter((w) => w.length > 3).sort((a, b) => b.length - a.length);
      hits = words.length ? searchSkills(skills, words[0]) : [];
    }
    const ids = hits
      .slice(0, 12)
      .sort((a, b) => rank(a) - rank(b))
      .map((s) => s.id)
      .filter((id) => !taken.has(id))
      .slice(0, 3);
    ids.forEach((id) => taken.add(id));
    if (ids.length) out.push({ need: n.need.slice(0, 200), skillIds: ids });
  }
  return out;
}

/**
 * Guided-mode skill needs: each stack item and integration becomes a search.
 * Goals are left out: without a model, phrases like "cut manual effort" only
 * produce keyword noise.
 */
export function guidedNeeds(brief: Brief): { need: string; query: string }[] {
  return [...brief.stack, ...brief.integrations]
    .map((x) => x.replace(/[^\w\s.+#-]/g, " ").trim())
    .filter((x) => x.length > 2)
    .slice(0, 6)
    .map((x) => ({ need: x, query: x.split(/\s+/).slice(0, 3).join(" ") }));
}
