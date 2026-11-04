/**
 * Business-and-developer-friendly domains for the skill catalog. Pure data so
 * the sync script, server pages and the client Kit Studio can all import it.
 * Every upstream category (Google's `metadata.category`, skills.sh topics,
 * Agentic Awesome Skills categories) is folded into one of these.
 */

export const DOMAINS = [
  { id: "agent-workflows", label: "Agent workflows", blurb: "Planning, debugging, subagents and autonomous loops." },
  { id: "frontend", label: "Frontend & UI", blurb: "React, Next.js, components and web performance." },
  { id: "design", label: "Design & UX", blurb: "Interface taste, design systems and critique." },
  { id: "backend", label: "Backend & APIs", blurb: "Services, APIs, integrations and frameworks." },
  { id: "data", label: "Data & databases", blurb: "SQL, NoSQL, analytics and data engineering." },
  { id: "cloud", label: "Cloud platforms", blurb: "Google Cloud, AWS, Azure, Kubernetes and serverless." },
  { id: "devops", label: "DevOps & reliability", blurb: "CI/CD, observability, SRE and automation." },
  { id: "testing", label: "Testing & QA", blurb: "TDD, Playwright, verification and code quality." },
  { id: "security", label: "Security & compliance", blurb: "AppSec, IAM, threat modelling and audits." },
  { id: "ai-ml", label: "AI & machine learning", blurb: "Models, RAG, evaluation and agent platforms." },
  { id: "mobile", label: "Mobile", blurb: "Expo, React Native, iOS and Android." },
  { id: "docs", label: "Docs & content", blurb: "Documentation, writing, media and documents." },
  { id: "product", label: "Product & business", blurb: "Strategy, project management, finance and ops." },
  { id: "marketing", label: "Marketing & growth", blurb: "SEO, CRO, copywriting, ads and analytics." },
  { id: "other", label: "Everything else", blurb: "Specialist and niche skills." },
] as const;

export type DomainId = (typeof DOMAINS)[number]["id"];

export const DOMAIN_BY_ID = Object.fromEntries(DOMAINS.map((d) => [d.id, d])) as Record<
  DomainId,
  (typeof DOMAINS)[number]
>;

export type CatalogSource = "curated" | "google" | "skills-sh" | "aaskills";

export const SOURCE_LABEL: Record<CatalogSource, string> = {
  curated: "Curated",
  google: "Google",
  "skills-sh": "skills.sh",
  aaskills: "Agentic Awesome Skills",
};

/** One skill in the catalog index (public/skill-catalog/index.json). */
export type CatalogSkill = {
  /** Unique id: `<source>:<name>`. */
  id: string;
  /** Folder / frontmatter name, used as the emitted skill directory. */
  name: string;
  title: string;
  description: string;
  domain: DomainId;
  source: CatalogSource;
  /** Upstream category or topic label, shown as a secondary tag. */
  category?: string;
  /** GitHub `owner/repo`; absent for curated skills. */
  repo?: string;
  /** Commit the entry was indexed at; raw files are fetched pinned to it. */
  sha?: string;
  /** Skill directory within the repo. */
  path?: string;
  license?: string;
  /** Licence permits copying SKILL.md into a generated kit. */
  copyable: boolean;
  version?: string;
  /** Upstream risk label (Agentic Awesome Skills). */
  risk?: string;
  /** Flat reference files relative to the skill directory. */
  refs?: string[];
  install?: string;
};

export type CatalogIndex = {
  generatedAt: string;
  sources: { source: CatalogSource; repos: { repo: string; sha: string; license: string }[] }[];
  skills: CatalogSkill[];
};

export function rawUrl(s: Pick<CatalogSkill, "repo" | "sha" | "path">, file = "SKILL.md"): string | null {
  if (!s.repo || !s.sha || s.path === undefined) return null;
  const dir = s.path ? `${s.path}/` : "";
  return `https://raw.githubusercontent.com/${s.repo}/${s.sha}/${dir}${file}`;
}

export function sourceUrl(s: Pick<CatalogSkill, "repo" | "sha" | "path">): string | null {
  if (!s.repo) return null;
  const host = "https://github" + ".com";
  return `${host}/${s.repo}/tree/${s.sha ?? "HEAD"}/${s.path ?? ""}`;
}
