import Link from "next/link";
import {
  ArrowRight,
  Check,
  Cpu,
  FileCheck,
  Lock,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, StatGrid, type Stat } from "@/components/page-header";
import { getKitSkills } from "@/lib/kit/skills";
import { getKitMcpServers } from "@/lib/kit/mcp-servers";

const STATS: Stat[] = [
  { icon: FileCheck, label: "Traceability", value: "Versioned & auditable", hint: "Every rule, skill and hook ships with an audit manifest." },
  { icon: Lock, label: "Data safety", value: "No secrets in context", hint: "Credentials and production data stay out of prompts." },
  { icon: ShieldCheck, label: "Enforcement", value: "4 governance gates", hint: "Pre-tool, pre-commit, pre-merge and CI checks." },
  { icon: Cpu, label: "Portability", value: "5 assistants", hint: "Claude Code, Copilot, Cursor, Gemini CLI, Google ADK." },
];

const STUDIO_FLOW = ["Discovery", "Organisation", "Project", "Stack", "Review & export"] as const;

const TIERS = [
  {
    name: "Enterprise standard",
    tag: "Default",
    body: "Secure-coding rules, test requirements and peer review.",
    points: ["Blocking filesystem and SQL guards", "Discovery before code"],
  },
  {
    name: "Regulated",
    tag: "Strict",
    body: "For finance and healthcare: OWASP ASVS L2 and dual approval.",
    points: ["Masked synthetic data only", "Protected CI environments"],
  },
  {
    name: "Sandbox",
    tag: "R&D",
    body: "Fast prototyping in isolated, ephemeral environments.",
    points: ["No production network access", "Local model experiments"],
  },
] as const;

export default async function HomePage() {
  const [skills, mcpServers] = await Promise.all([getKitSkills(), getKitMcpServers()]);

  return (
    <>
      <PageHeader
        eyebrow="AI Centre of Excellence"
        icon={Sparkles}
        title="Governed AI adoption,"
        highlight="ready to run."
        description="Turn your engineering standards, data boundaries and policies into drop-in configurations for every AI coding assistant your teams use."
        actions={
          <>
            <Button render={<Link href="/studio" />}>
              Build a kit <ArrowRight className="size-3.5" />
            </Button>
            <Button variant="outline" render={<Link href="/playbooks" />}>
              Playbooks
            </Button>
          </>
        }
      >
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
                <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                  {t.tag}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{t.body}</p>
              <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-foreground/80">
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
        <div className="surface relative overflow-hidden p-5 sm:p-6">
          <div aria-hidden className="bg-grid pointer-events-none absolute inset-0 opacity-60" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-xl">
              <p className="eyebrow">Kit Studio</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight">Configure your agent kit in one workspace</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                A full-screen studio with a live manifest of every file it will generate. {skills.length} skills and{" "}
                {mcpServers.length} MCP servers ready to use.
              </p>
              <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="size-3.5 text-success" /> Runs in your browser. No code is uploaded.
              </p>
            </div>
            <Button size="lg" render={<Link href="/studio" />}>
              Open Kit Studio <ArrowRight className="size-4" />
            </Button>
          </div>
          <ol className="relative mt-6 grid grid-cols-1 gap-2 sm:grid-cols-5">
            {STUDIO_FLOW.map((f, i) => (
              <li
                key={f}
                style={{ "--i": i } as React.CSSProperties}
                className="stagger flex animate-fade-up items-center gap-2.5 rounded-lg border bg-background/60 px-3 py-2.5"
              >
                <span className="font-mono text-[11px] font-semibold text-primary">0{i + 1}</span>
                <span className="text-[13px] font-medium">{f}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}
