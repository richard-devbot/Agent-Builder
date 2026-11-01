/**
 * Builds public/skill-catalog/index.json from external skill sources:
 *
 *   - google/skills                       (Apache-2.0, all skills)
 *   - skills.sh topic pages               (each listed skill, from its own repo)
 *   - sickn33/agentic-awesome-skills      (its skills_index.json, offensive skills excluded)
 *
 * Only metadata is committed. Each entry is pinned to the commit it was indexed
 * at; Kit Studio fetches SKILL.md (and flat references) from that commit when a
 * licensed skill is selected, and emits an install command for the rest.
 *
 * Usage: npm run skills:sync   (needs git and network access)
 */

import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import matter from "gray-matter";
import type { CatalogIndex, CatalogSkill, CatalogSource, DomainId } from "../lib/skill-catalog/domains";

const CACHE = join(tmpdir(), "skill-catalog-sources");
const OUT = join(process.cwd(), "public", "skill-catalog", "index.json");

/** Licences whose terms allow redistributing SKILL.md inside a generated kit. */
const PERMISSIVE = new Set(["MIT", "MIT-0", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "CC-BY-4.0", "CC0-1.0", "Unlicense"]);

const SKILLS_SH_TOPICS: Record<string, DomainId> = {
  "agent-workflows": "agent-workflows",
  databases: "data",
  design: "design",
  marketing: "marketing",
  mobile: "mobile",
  nextjs: "frontend",
  react: "frontend",
  testing: "testing",
};

const GOOGLE_CATEGORY: Record<string, DomainId> = {
  AiAndMachineLearning: "ai-ml",
  Security: "security",
  SecurityAndCompliance: "security",
  Identity: "security",
  CloudObservabilityAndMonitoring: "devops",
  DevOps: "devops",
  GoogleAds: "marketing",
  GoogleAnalytics: "marketing",
  BigDataAndAnalytics: "data",
  Databases: "data",
  Storage: "data",
  ApplicationDevelopment: "backend",
};

// ── helpers ──────────────────────────────────────────────────────────────────

function sh(cmd: string, args: string[], cwd?: string): string {
  return execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 << 20 }).trim();
}

/** Shallow clone (or refresh) a repo into the cache; returns [dir, sha]. */
function clone(repo: string): [string, string] {
  const dir = join(CACHE, repo.replace("/", "__"));
  if (!existsSync(dir)) {
    mkdirSync(CACHE, { recursive: true });
    sh("git", ["clone", "--quiet", "--depth", "1", `https://github.com/${repo}.git`, dir]);
  } else {
    sh("git", ["fetch", "--quiet", "--depth", "1", "origin", "HEAD"], dir);
    sh("git", ["reset", "--quiet", "--hard", "FETCH_HEAD"], dir);
  }
  return [dir, sh("git", ["rev-parse", "HEAD"], dir)];
}

/** SPDX id from a LICENSE file's text; "none" when absent or unrecognised. */
function licenseIn(dir: string): string {
  const file = readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(f));
  if (!file) return "none";
  const t = readFileSync(join(dir, file), "utf8").slice(0, 4000);
  if (/Apache License[\s\S]*Version 2\.0/i.test(t)) return "Apache-2.0";
  if (/Permission is hereby granted, free of charge/i.test(t)) return "MIT";
  if (/Redistribution and use in source and binary forms/i.test(t)) return /Neither the name/i.test(t) ? "BSD-3-Clause" : "BSD-2-Clause";
  if (/Permission to use, copy, modify, and\/or distribute/i.test(t)) return "ISC";
  if (/Creative Commons Attribution 4\.0/i.test(t)) return "CC-BY-4.0";
  if (/This is free and unencumbered software/i.test(t)) return "Unlicense";
  return "proprietary-or-unknown";
}

/** A skill-level licence file (e.g. anthropics/skills) overrides the repo licence. */
function skillLicense(repoDir: string, skillDir: string): string {
  const own = licenseIn(skillDir);
  return own !== "none" ? own : licenseIn(repoDir);
}

function findSkillFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === ".git" || name === "node_modules") continue;
      const p = join(dir, name);
      // lstat: repos ship dangling symlinks (e.g. vercel/ai), which are never skills.
      const st = lstatSync(p);
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) walk(p);
      else if (name === "SKILL.md") out.push(p);
    }
  };
  walk(root);
  return out;
}

type Parsed = { name: string; title: string; description: string; version?: string; category?: string };

function parseSkill(file: string): Parsed {
  const raw = readFileSync(file, "utf8");
  let data: Record<string, unknown> = {};
  let content = raw;
  try {
    const m = matter(raw);
    data = m.data;
    content = m.content;
  } catch {
    // Malformed frontmatter: fall back to the folder name and first paragraph.
  }
  const meta = (data.metadata ?? {}) as Record<string, unknown>;
  const name = String(data.name ?? basename(dirname(file)));
  const h1 = /^#\s+(.+)$/m.exec(content)?.[1]?.trim();
  return {
    name,
    title: h1 && h1.length <= 80 ? h1 : titleize(name),
    description: clip(String(data.description ?? content.split(/\n\s*\n/).find((p) => p.trim() && !p.startsWith("#")) ?? "")),
    version: meta.version ? String(meta.version) : data.version ? String(data.version) : undefined,
    category: meta.category ? String(meta.category) : undefined,
  };
}

/** Flat reference files next to SKILL.md (single-hop, per the Agent Skills layout). */
function refsOf(skillDir: string): string[] {
  const refDir = join(skillDir, "references");
  if (!existsSync(refDir)) return [];
  return readdirSync(refDir)
    .filter((f) => statSync(join(refDir, f)).isFile() && /\.(md|txt|json|ya?ml)$/i.test(f))
    .slice(0, 25)
    .map((f) => `references/${f}`);
}

function titleize(slug: string): string {
  return slug.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}

function clip(s: string, n = 280): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
}

/** Fold an Agentic Awesome Skills category (plus name/description cues) into a domain. */
function aasDomain(category: string, text: string): DomainId {
  const c = category.toLowerCase();
  const rules: [RegExp, DomainId][] = [
    [/seo|marketing|backlink|keyword|competitor|growth|schema &|on-page|ads?\b/, "marketing"],
    [/secur|reverse|compliance|audit/, "security"],
    [/test|quality|qa\b/, "testing"],
    [/mobile/, "mobile"],
    [/front|web-dev|^web$/, "frontend"],
    [/design|creative|graphic/, "design"],
    [/cloud/, "cloud"],
    [/devops|reliab|ops$|automation|ml-ops/, "devops"],
    [/database|data/, "data"],
    [/ai|ml\b|agent-|prompt|voice|memory|context|llm/, "ai-ml"],
    [/workflow|orchestr|meta|skill|planning|reason|squad|bundle|mcp|tool/, "agent-workflows"],
    [/backend|api|architecture|fullstack|framework/, "backend"],
    [/content|writ|media|document|presentation|spreadsheet|video|education|knowledge|learning/, "docs"],
    [/business|product|project|finance|legal|operations|consult|commerce|payment|communic|collab|career|research|analysis|strategy|productivity|office|shopping/, "product"],
  ];
  for (const [re, d] of rules) if (re.test(c)) return d;
  // Generic buckets ("development", "code", "engineering"…) are split by text cues.
  if (/development|code|coding|engineering|developer|debug|app-builder|core-dev|super-code/.test(c)) {
    const t = text.toLowerCase();
    if (/\b(react|next\.?js|vue|angular|svelte|css|tailwind|frontend|ui)\b/.test(t)) return "frontend";
    if (/\b(test|tdd|playwright|jest|pytest)\b/.test(t)) return "testing";
    if (/\b(sql|postgres|mongo|database)\b/.test(t)) return "data";
    if (/\b(docker|kubernetes|ci\/cd|deploy|terraform)\b/.test(t)) return "devops";
    return "backend";
  }
  return "other";
}

// ── sources ──────────────────────────────────────────────────────────────────

async function google(): Promise<[CatalogSkill[], { repo: string; sha: string; license: string }]> {
  const repo = "google/skills";
  const [dir, sha] = clone(repo);
  const license = "Apache-2.0";
  // plugins/ repackages skills that already live under skills/, so index skills/ only.
  const skills = findSkillFiles(join(dir, "skills")).map((file): CatalogSkill => {
    const p = parseSkill(file);
    const path = relative(dir, dirname(file));
    const group = path.split("/")[1];
    return {
      id: `google:${p.name}`,
      name: p.name,
      title: p.title,
      description: p.description,
      domain: GOOGLE_CATEGORY[p.category ?? ""] ?? (group === "ads" ? "marketing" : group === "identity" ? "security" : "cloud"),
      source: "google",
      category: p.category?.replace(/([a-z])([A-Z])/g, "$1 $2") ?? titleize(group),
      repo,
      sha,
      path,
      license,
      copyable: true,
      version: p.version,
      refs: refsOf(dirname(file)),
      install: `npx skills add ${repo} --skill ${p.name}`,
    };
  });
  return [skills, { repo, sha, license }];
}

async function skillsSh(): Promise<[CatalogSkill[], { repo: string; sha: string; license: string }[]]> {
  // topic -> [owner/repo/skill]
  const listed = new Map<string, { repo: string; skill: string; topic: string }>();
  for (const topic of Object.keys(SKILLS_SH_TOPICS)) {
    const html = await (await fetch(`https://www.skills.sh/topic/${topic}`)).text();
    for (const m of html.matchAll(/href="\/([a-z0-9_.-]+)\/([a-z0-9_.-]+)\/([a-z0-9_.:-]+)"/gi)) {
      const key = `${m[1]}/${m[2]}/${m[3]}`;
      if (!listed.has(key)) listed.set(key, { repo: `${m[1]}/${m[2]}`, skill: m[3], topic });
    }
  }

  const byRepo = new Map<string, { skill: string; topic: string }[]>();
  for (const v of listed.values()) byRepo.set(v.repo, [...(byRepo.get(v.repo) ?? []), v]);

  const skills: CatalogSkill[] = [];
  const repos: { repo: string; sha: string; license: string }[] = [];
  for (const [repo, wanted] of byRepo) {
    let dir: string, sha: string;
    try {
      [dir, sha] = clone(repo);
    } catch (e) {
      console.warn(`  skip ${repo}: clone failed (${(e as Error).message.split("\n")[0]})`);
      continue;
    }
    const license = licenseIn(dir);
    repos.push({ repo, sha, license });
    const files = findSkillFiles(dir).map((f) => ({ file: f, parsed: parseSkill(f) }));
    for (const w of wanted) {
      const hit = files.find((f) => f.parsed.name === w.skill) ?? files.find((f) => basename(dirname(f.file)) === w.skill);
      if (!hit) {
        // Listed on skills.sh but not at a discoverable path (renamed or packaged
        // differently upstream). The skills CLI still resolves it, so keep it install-only.
        skills.push({
          id: `skills-sh:${repo}/${w.skill}`,
          name: w.skill,
          title: titleize(w.skill),
          description: `Listed in the skills.sh ${titleize(w.topic)} topic. Installed with the skills CLI.`,
          domain: SKILLS_SH_TOPICS[w.topic],
          source: "skills-sh",
          category: titleize(w.topic),
          repo,
          license,
          copyable: false,
          install: `npx skills add ${repo} --skill ${w.skill}`,
        });
        continue;
      }
      const path = relative(dir, dirname(hit.file));
      const skillLic = skillLicense(dir, dirname(hit.file));
      skills.push({
        id: `skills-sh:${repo}/${w.skill}`,
        name: hit.parsed.name,
        title: hit.parsed.title,
        description: hit.parsed.description,
        domain: SKILLS_SH_TOPICS[w.topic],
        source: "skills-sh",
        category: titleize(w.topic),
        repo,
        sha,
        path,
        license: skillLic,
        copyable: PERMISSIVE.has(skillLic),
        version: hit.parsed.version,
        refs: refsOf(dirname(hit.file)),
        install: `npx skills add ${repo} --skill ${w.skill}`,
      });
    }
  }
  return [skills, repos];
}

type AasEntry = {
  id: string;
  path: string;
  category: string;
  name: string;
  description: string;
  risk: string;
  source: string;
  source_repo?: string;
  license?: string;
};

async function aaskills(): Promise<[CatalogSkill[], { repo: string; sha: string; license: string }]> {
  const repo = "sickn33/agentic-awesome-skills";
  const [dir, sha] = clone(repo);
  const entries = JSON.parse(readFileSync(join(dir, "skills_index.json"), "utf8")) as AasEntry[];
  const skills = entries
    // Offensive-security skills (exploitation, bug-bounty tooling) don't belong in a governed kit.
    .filter((e) => e.risk !== "offensive" && existsSync(join(dir, e.path, "SKILL.md")))
    .map((e): CatalogSkill => {
      const spdx = e.license?.replace(/ license$/i, "");
      // Original content is CC BY 4.0 (LICENSE-CONTENT); imported skills keep their upstream licence.
      const license = spdx ?? (e.source_repo || e.source === "community" ? "unknown" : "CC-BY-4.0");
      const p = parseSkill(join(dir, e.path, "SKILL.md"));
      return {
        id: `aaskills:${e.id}`,
        name: e.name,
        title: p.title,
        description: clip(e.description),
        domain: aasDomain(e.category, `${e.name} ${e.description}`),
        source: "aaskills",
        category: titleize(e.category),
        repo,
        sha,
        path: e.path,
        license,
        copyable: PERMISSIVE.has(license),
        version: p.version,
        risk: e.risk,
        refs: refsOf(join(dir, e.path)),
        install: `npx skills add ${repo} --skill ${e.name}`,
      };
    });
  return [skills, { repo, sha, license: "MIT / CC-BY-4.0" }];
}

// ── main ─────────────────────────────────────────────────────────────────────

const [g, gRepo] = await google();
console.log(`google/skills: ${g.length}`);
const [s, sRepos] = await skillsSh();
console.log(`skills.sh topics: ${s.length} from ${sRepos.length} repos`);
const [a, aRepo] = await aaskills();
console.log(`agentic-awesome-skills: ${a.length}`);

const seen = new Set<string>();
const skills = [...g, ...s, ...a].filter((sk) => (seen.has(sk.id) ? false : (seen.add(sk.id), true)));

const index: CatalogIndex = {
  generatedAt: new Date().toISOString(),
  sources: [
    { source: "google" as CatalogSource, repos: [gRepo] },
    { source: "skills-sh" as CatalogSource, repos: sRepos },
    { source: "aaskills" as CatalogSource, repos: [aRepo] },
  ],
  skills,
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(index));
const copyable = skills.filter((x) => x.copyable).length;
console.log(`wrote ${relative(process.cwd(), OUT)}: ${skills.length} skills (${copyable} copyable, ${skills.length - copyable} install-only)`);
