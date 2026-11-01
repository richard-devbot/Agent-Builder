/**
 * Canonical technology catalog for the Claude Kit Builder.
 *
 * Employees pick technologies here; the builder uses each tech's `id` to
 * recommend matching agents (lib/kit/agents.ts) and rule packs
 * (lib/kit/rules.ts). Free-text technologies the user types are carried
 * through as ad-hoc ids and simply listed in the generated rules.
 */

export type TechGroup =
  | "language"
  | "frontend"
  | "backend"
  | "database"
  | "cloud"
  | "devops"
  | "testing"
  | "ai";

export type Technology = {
  id: string;
  label: string;
  group: TechGroup;
  /** Alternate spellings to match free-text input against. */
  aliases?: string[];
};

export const TECH_GROUP_LABEL: Record<TechGroup, string> = {
  language: "Languages",
  frontend: "Frontend",
  backend: "Backend",
  database: "Database",
  cloud: "Cloud",
  devops: "DevOps",
  testing: "Testing",
  ai: "AI tooling",
};

export const TECH_GROUP_ORDER: TechGroup[] = [
  "language",
  "frontend",
  "backend",
  "database",
  "testing",
  "cloud",
  "devops",
  "ai",
];

export const TECHNOLOGIES: readonly Technology[] = [
  // Languages
  { id: "typescript", label: "TypeScript", group: "language", aliases: ["ts"] },
  { id: "javascript", label: "JavaScript", group: "language", aliases: ["js", "node"] },
  { id: "python", label: "Python", group: "language", aliases: ["py"] },
  { id: "java", label: "Java", group: "language" },
  { id: "csharp", label: "C#", group: "language", aliases: ["c#", "dotnet", ".net"] },
  { id: "go", label: "Go", group: "language", aliases: ["golang"] },
  { id: "sql", label: "SQL", group: "language" },

  // Frontend
  { id: "nextjs", label: "Next.js", group: "frontend", aliases: ["next"] },
  { id: "react", label: "React", group: "frontend" },
  { id: "angular", label: "Angular", group: "frontend" },
  { id: "vue", label: "Vue", group: "frontend" },
  { id: "tailwind", label: "Tailwind CSS", group: "frontend", aliases: ["tailwindcss"] },

  // Backend
  { id: "node", label: "Node.js / Express", group: "backend", aliases: ["nodejs", "express"] },
  { id: "fastapi", label: "FastAPI", group: "backend" },
  { id: "django", label: "Django", group: "backend" },
  { id: "spring-boot", label: "Spring Boot", group: "backend", aliases: ["spring"] },
  { id: "dotnet", label: ".NET / ASP.NET", group: "backend", aliases: ["asp.net", "aspnet", "dotnet-core"] },

  // Database
  { id: "postgres", label: "PostgreSQL", group: "database", aliases: ["postgresql"] },
  { id: "mysql", label: "MySQL", group: "database" },
  { id: "sqlserver", label: "SQL Server", group: "database", aliases: ["mssql", "azure-sql"] },
  { id: "mongodb", label: "MongoDB", group: "database", aliases: ["mongo"] },
  { id: "redis", label: "Redis", group: "database" },

  // Testing
  { id: "playwright", label: "Playwright", group: "testing" },
  { id: "cypress", label: "Cypress", group: "testing" },
  { id: "jest", label: "Jest / Vitest", group: "testing", aliases: ["vitest"] },
  { id: "pytest", label: "pytest", group: "testing" },

  // Cloud
  { id: "azure", label: "Azure", group: "cloud" },
  { id: "aws", label: "AWS", group: "cloud" },
  { id: "gcp", label: "Google Cloud", group: "cloud", aliases: ["google-cloud"] },

  // DevOps
  { id: "docker", label: "Docker", group: "devops" },
  { id: "kubernetes", label: "Kubernetes", group: "devops", aliases: ["k8s"] },
  { id: "github-actions", label: "GitHub Actions", group: "devops" },
  { id: "azure-devops", label: "Azure DevOps", group: "devops", aliases: ["ado"] },
  { id: "terraform", label: "Terraform", group: "devops" },

  // AI tooling
  { id: "claude-code", label: "Claude Code", group: "ai" },
  { id: "mcp", label: "MCP servers", group: "ai" },
] as const;

export const TECH_BY_ID: Record<string, Technology> = TECHNOLOGIES.reduce(
  (acc, t) => {
    acc[t.id] = t;
    return acc;
  },
  {} as Record<string, Technology>,
);

export function techLabel(id: string): string {
  return TECH_BY_ID[id]?.label ?? id;
}

/** Normalize a free-text tech entry to a catalog id when possible. */
export function resolveTechId(input: string): string {
  const norm = input.trim().toLowerCase();
  if (!norm) return "";
  if (TECH_BY_ID[norm]) return norm;
  const hit = TECHNOLOGIES.find(
    (t) =>
      t.label.toLowerCase() === norm ||
      (t.aliases ?? []).some((a) => a.toLowerCase() === norm),
  );
  return hit ? hit.id : norm;
}
