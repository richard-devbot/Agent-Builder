import { promises as fs } from "node:fs";
import path from "node:path";
import { CheckCircle2, FileCode, Info, Layers, Lock, ShieldCheck, Users } from "lucide-react";
import { MDXContent } from "@/components/mdx-content";
import { PageHeader, SectionHeading, StatGrid, type Stat } from "@/components/page-header";

export const metadata = {
  title: "Governance",
  description: "AI Centre of Excellence governance model, asset certification pipeline and contribution guide.",
};

const STATS: Stat[] = [
  { icon: CheckCircle2, label: "Quality bar", value: "Field-tested 3×", hint: "Validated in real work before submission." },
  { icon: Lock, label: "Secret audit", value: "No sensitive data", hint: "Scanned for PII, credentials and internal hostnames." },
  { icon: Users, label: "Review board", value: "Named reviewers", hint: "Architects and security leads approve every merge." },
  { icon: Layers, label: "Waivers", value: "Time-bound & logged", hint: "Exceptions need a named owner and expire." },
];

const PIPELINE = [
  { tier: "1", stage: "Author", title: "Build in a sandbox", body: "Synthetic data and spec-driven templates only." },
  { tier: "2", stage: "Validate", title: "Schema & guardrail scan", body: "Zod schema, CWE checklist and style rules." },
  { tier: "3", stage: "Review", title: "CoE board sign-off", body: "Practice leads check fit and a consistent voice." },
  { tier: "4", stage: "Publish", title: "Catalog release", body: "Available to every team in all supported assistants." },
] as const;

async function loadGuide(): Promise<string> {
  const filePath = path.join(process.cwd(), "docs", "contribution-guide.md");
  const raw = await fs.readFile(filePath, "utf-8");
  // Strip a top-level H1 if present — we render our own header.
  return raw.replace(/^#\s+.+\n+/, "");
}

export default async function ContributePage() {
  const body = await loadGuide();

  return (
    <>
      <PageHeader
        eyebrow="AI Centre of Excellence"
        icon={ShieldCheck}
        title="Governance charter and"
        highlight="contribution program."
        description="Every prompt, skill and connector passes the same privacy, security and architecture review before it reaches a developer's IDE."
      >
        <StatGrid items={STATS} />
      </PageHeader>

      <div className="container-page grid gap-6 py-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <SectionHeading eyebrow="Certification" title="Four-stage pipeline" />
          <ol className="relative space-y-2 before:absolute before:bottom-6 before:left-[17px] before:top-6 before:w-px before:bg-gradient-to-b before:from-primary/60 before:to-brand-2/60">
            {PIPELINE.map((p, i) => (
              <li
                key={p.tier}
                style={{ "--i": i } as React.CSSProperties}
                className="surface stagger card-hover relative flex animate-fade-up gap-3 p-3"
              >
                <span className="relative z-10 flex size-[22px] shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                  {p.tier}
                </span>
                <div>
                  <p className="text-[10.5px] font-semibold uppercase tracking-wider text-primary">{p.stage}</p>
                  <p className="text-[13px] font-semibold">{p.title}</p>
                  <p className="text-xs text-muted-foreground">{p.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="flex items-start gap-2.5 rounded-xl border border-info/25 bg-info/8 p-3 text-xs leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
            <p>
              <strong className="text-foreground">Submissions:</strong> pull requests are not open yet.
              Prepare and validate assets locally, then share them with {"Richardson & Team"} for review.
            </p>
          </div>
        </aside>

        <section className="min-w-0">
          <SectionHeading
            eyebrow="Specification"
            title="Asset authoring guide"
            aside={
              <span className="inline-flex items-center gap-1.5">
                <FileCode className="size-3.5" /> docs/contribution-guide.md
              </span>
            }
          />
          <article className="prose surface max-w-none p-6 sm:p-8">
            <MDXContent source={body} />
          </article>
        </section>
      </div>
    </>
  );
}
