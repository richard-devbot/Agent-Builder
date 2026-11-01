/** Catalog search, pure so both the browser and server routes can use it. */

import type { CatalogSkill } from "./domains";

/** Lightweight ranked search: every query term must appear; title hits rank first. */
export function searchSkills(skills: CatalogSkill[], query: string): CatalogSkill[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return skills;
  const scored: [CatalogSkill, number][] = [];
  for (const s of skills) {
    const title = `${s.title} ${s.name}`.toLowerCase();
    const rest = `${s.description} ${s.category ?? ""} ${s.repo ?? ""}`.toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (title.includes(t)) score += title.startsWith(t) ? 4 : 3;
      else if (rest.includes(t)) score += 1;
      else {
        score = -1;
        break;
      }
    }
    if (score > 0) scored.push([s, score]);
  }
  return scored.sort((a, b) => b[1] - a[1]).map(([s]) => s);
}
