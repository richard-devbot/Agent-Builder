import Link from "next/link";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  CloudUpload,
  Cpu,
  Database,
  FileCheck,
  FolderGit2,
  Lock,
  Search,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, StatGrid, type Stat } from "@/components/page-header";
import { InsightsPanel } from "@/components/insights-panel";
import { getKitSkills } from "@/lib/kit/skills";
import { getKitMcpServers } from "@/lib/kit/mcp-servers";

const STATS: Stat[] = [
  {
    icon: FileCheck,
    label: "Traceability",
    value: "kit.lock.json provenance",
    hint: "Every rule, skill, standard, and deployment ships with an audit lockfile.",
  },
  {
    icon: Lock,
    label: "Data safety",
    value: "WIF + Zero JSON keys",
    hint: "Credentials stay out of prompts and repos; auth uses Workload Identity Federation.",
  },
  {
    icon: ShieldCheck,
    label: "Enforcement",
    value: "4 governance gates",
    hint: "Structure check, Gitleaks, Semgrep SAST, and smoke tests before deploy.",
  },
  {
    icon: Cpu,
    label: "Portability",
    value: "5 assistants + ADK",
    hint: "Google ADK, Gemini CLI, Claude Code, Copilot, and Cursor.",
  },
];

const GOVERNED_PIPELINE = [
  {
    step: "01",
    title: "Discover",
    subtitle: "Systems & risk tier",
    icon: Search,
    href: "/studio",
  },
  {
    step: "02",
    title: "Kit & Standards",
    subtitle: "Rules, skills & lockfile",
    icon: FolderGit2,
    href: "/studio",
  },
  {
    step: "03",
    title: "Build in Antigravity",
    subtitle: "AGENTS.md + GEMINI.md",
    icon: Wrench,
    href: "/studio",
  },
  {
    step: "04",
    title: "Checks",
    subtitle: "Gitleaks + Semgrep SAST",
    icon: ShieldCheck,
    href: "/studio",
  },
  {
    step: "05",
    title: "Deploy to Agent Engine",
    subtitle: "adk deploy agent_engine",
    icon: CloudUpload,
    href: "/studio",
  },
  {
    step: "06",
    title: "Registry",
    subtitle: "19-digit RESOURCE_ID",
    icon: Database,
    href: "/studio",
  },
] as const;

const STUDIO_FLOW = [
  "Discovery",
  "Organisation",
  "Project",
  "Stack",
  "Deploy Setup",
  "Review & Push",
  "Deploy to Cloud",
] as const;

const TIERS = [
  {
    name: "Enterprise standard",
    tag: "Default",
    body: "Secure-coding rules, Agent Engine telemetry, and WIF CI/CD pipeline.",
    points: ["Blocking filesystem and SQL guards", "Mandatory 6-key Agent Engine .env"],
  },
  {
    name: "Regulated",
    tag: "Strict",
    body: "For finance and healthcare: OWASP ASVS L2, PII redaction, and prod approval gate.",
    points: ["EVENT_ONLY telemetry capture", "Protected GitLab Environment gate"],
  },
  {
    name: "Sandbox",
    tag: "Rapid POC",
    body: "Guided 3-minute starter kit for non-technical or technical builders.",
    points: ["Curated ADK blueprints", "Zero cloud/security setup knowledge required"],
  },
] as const;

export default async function HomePage() {
  const [skills, mcpServers] = await Promise.all([
    getKitSkills(),
    getKitMcpServers(),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Governed Gemini & Vertex AI Agent Engine Platform"
        icon={Sparkles}
        title="From idea to a governed,"
        highlight="deployed Gemini agent"
        description="Generate a governed kit in minutes, build your agent in Google Antigravity, and deploy it to Vertex AI Agent Engine following the company deployment standard — without needing deep cloud or security expertise."
        actions={
          <>
            <Button
              size="lg"
              className="bg-brand-gradient text-white shadow-sm hover:opacity-95"
              render={<Link href="/studio" />}
            >
              Start building <ArrowRight className="size-4" />
            </Button>
            <Button size="lg" variant="outline" render={<Link href="/playbooks" />}>
              Playbooks
            </Button>
          </>
        }
      >
        {/* Animated Horizontal Governed Pipeline Visual */}
        <div className="surface relative mb-4 overflow-hidden p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex size-2 rounded-full bg-primary" />
              <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
                Governed End-to-End Pipeline
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              Click any stage to jump directly into the workflow
            </span>
          </div>

          {/* Subtle moving highlight bar */}
          <div
            aria-hidden
            className="mb-4 h-1 w-full overflow-hidden rounded-full bg-secondary"
          >
            <div
              className="h-full w-full animate-shimmer"
              style={{
                backgroundImage:
                  "linear-gradient(90deg, transparent 0%, #4F46E5 35%, #0EA5E9 65%, transparent 100%)",
                backgroundSize: "200% 100%",
              }}
            />
          </div>

          <ol className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-6">
            {GOVERNED_PIPELINE.map((item, idx) => {
              const Icon = item.icon;
              return (
                <li key={item.title} className="relative flex">
                  <Link
                    href={item.href}
                    className="group relative flex w-full flex-col justify-between rounded-xl border border-border bg-card p-3 transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 rounded-md bg-accent px-1.5 py-0.5 font-mono text-[10px] font-semibold text-accent-foreground">
                        {item.step}
                      </span>
                      <Icon className="size-4 text-primary transition-transform group-hover:scale-110" />
                    </div>
                    <div className="mt-2.5">
                      <div className="text-[13px] font-semibold leading-snug text-foreground group-hover:text-primary">
                        {item.title}
                      </div>
                      <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                        {item.subtitle}
                      </div>
                    </div>
                    {idx < GOVERNED_PIPELINE.length - 1 && (
                      <ArrowRight
                        aria-hidden
                        className="pointer-events-none absolute -right-2 top-1/2 z-10 hidden size-3.5 -translate-y-1/2 rounded-full border border-border bg-card p-0.5 text-muted-foreground lg:block"
                      />
                    )}
                  </Link>
                </li>
              );
            })}
          </ol>
        </div>

        <StatGrid items={STATS} />

        <div className="mt-2.5 grid grid-cols-1 gap-2.5 md:grid-cols-3">
          {TIERS.map((t, i) => (
            <div
              key={t.name}
              style={{ "--i": i + 4 } as React.CSSProperties}
              className="surface stagger card-hover animate-fade-up p-3.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-semibold">{t.name}</span>
                <span className="rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent-foreground">
                  {t.tag}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{t.body}</p>
              <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-foreground/85">
                {t.points.map((p) => (
                  <li key={p} className="flex items-center gap-1">
                    <Check className="size-3 text-success" strokeWidth={3} /> {p}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </PageHeader>

      <section className="container-page pt-8">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Guided Discovery & Blueprint Flow Card */}
          <div className="surface relative flex flex-col justify-between overflow-hidden p-5 sm:p-6">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-semibold text-accent-foreground">
                <Sparkles className="size-3" /> Guided 3-Minute Flow
              </div>
              <h2 className="mt-2 text-xl font-semibold tracking-tight">
                Discovery Agent — Start from plain business language
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Describe your team&apos;s workflow or upload requirements. The Discovery Agent identifies every internal system involved, generates a plain-language connection checklist, and configures a ready-to-deploy Antigravity + Agent Engine kit.
              </p>
              <ul className="mt-4 space-y-1.5 text-xs text-muted-foreground">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="size-3.5 text-success" /> Pre-configured <code>.env.example</code> with all mandatory Agent Engine telemetry keys
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="size-3.5 text-success" /> Plain-language Systems &amp; Connections checklist (Secret Manager vs GitLab CI)
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="size-3.5 text-success" /> Direct GitLab OAuth push &amp; release-tag deployment to Vertex AI Agent Engine
                </li>
              </ul>
            </div>
            <div className="mt-5 flex items-center gap-3">
              <Button
                className="bg-brand-gradient text-white shadow-sm hover:opacity-95"
                render={<Link href="/studio" />}
              >
                Launch Discovery <ArrowRight className="size-4" />
              </Button>
              <Button variant="outline" render={<Link href="/browse" />}>
                Browse Library
              </Button>
            </div>
          </div>

          {/* Advanced Kit Studio Card */}
          <div className="surface relative flex flex-col justify-between overflow-hidden p-5 sm:p-6">
            <div>
              <p className="eyebrow">Advanced Kit Studio</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight">
                Full multi-agent architecture &amp; standards studio
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Visual ADK multi-agent topology editor, 33 engineering &amp; observability standards across 10 categories, {skills.length} curated skills, and {mcpServers.length} governed MCP servers with live file preview.
              </p>
              <ol className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {STUDIO_FLOW.map((f, i) => (
                  <li
                    key={f}
                    style={{ "--i": i } as React.CSSProperties}
                    className="stagger flex animate-fade-up items-center gap-1.5 rounded-lg border bg-secondary/50 px-2.5 py-2"
                  >
                    <span className="font-mono text-[10px] font-semibold text-primary">
                      0{i + 1}
                    </span>
                    <span className="truncate text-xs font-medium">{f}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="mt-5 flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="size-3.5 text-success" /> Runs in your browser. Zero secrets in generated kits.
              </span>
              <Button variant="outline" render={<Link href="/studio" />}>
                Open Studio <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Local Insights Panel */}
      <InsightsPanel />
    </>
  );
}
