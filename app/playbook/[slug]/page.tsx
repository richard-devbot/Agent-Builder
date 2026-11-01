import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, Clock, ListChecks } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { MDXContent } from "@/components/mdx-content";
import { SectionHeading } from "@/components/page-header";
import { PlaybookIntakeForm } from "@/components/playbook/intake-form";
import { PlaybookProgressBar } from "@/components/playbook/progress-bar";
import { getAllPlaybooks, getPlaybookBySlug } from "@/lib/content";
import { cn } from "@/lib/utils";

type Params = { slug: string };

export async function generateStaticParams(): Promise<Params[]> {
  const playbooks = await getAllPlaybooks();
  return playbooks.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const playbook = await getPlaybookBySlug(slug);
  if (!playbook) return {};
  return {
    title: playbook.title,
    description: playbook.description,
  };
}

export default async function PlaybookIntakePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const playbook = await getPlaybookBySlug(slug);
  if (!playbook) notFound();

  // Two playbook modes:
  //   - "step" mode (custom-web-app, short focused playbooks): structured
  //     steps with progress bar, click-through, mark-complete.
  //   - "guide" mode (multi-quarter migration playbooks): no structured
  //     steps; the MDX body renders inline below the intake form as a
  //     long-form reference document.
  const isGuideMode = playbook.steps.length === 0;

  const stepsForBar = playbook.steps.map((s) => ({
    number: s.number,
    title: s.title,
  }));

  return (
    <div className="container-page py-6">
      <Breadcrumbs items={[{ label: "Playbooks", href: "/playbooks" }, { label: playbook.title }]} />

      <header className="surface relative mt-4 overflow-hidden p-5 sm:p-6">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-brand-2/5" />
        <div className="relative animate-fade-up">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary">Playbook</Badge>
            {isGuideMode ? (
              <Badge variant="outline" className="gap-1">
                <BookOpen className="size-3" aria-hidden /> Long-form guide
              </Badge>
            ) : null}
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{playbook.title}</h1>
          <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground sm:text-[15px]">{playbook.description}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            {!isGuideMode ? (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1">
                <ListChecks className="size-3.5 text-primary" aria-hidden />
                {playbook.steps.length} steps
              </span>
            ) : null}
            {playbook.totalEstimatedTime ? (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1">
                <Clock className="size-3.5 text-primary" aria-hidden />
                {playbook.totalEstimatedTime}
              </span>
            ) : null}
          </div>
        </div>
      </header>

      {!isGuideMode ? (
        <div className="mt-4">
          <PlaybookProgressBar playbookSlug={playbook.slug} steps={stepsForBar} />
        </div>
      ) : null}

      <div className={cn("mt-6 grid gap-5", !isGuideMode && "lg:grid-cols-[minmax(0,1fr)_380px]")}>
        <section className="surface animate-fade-up p-5 sm:p-6">
          <SectionHeading
            eyebrow="Intake"
            title="Tell us what you're building"
            description={
              isGuideMode
                ? "Record your project context while you work through the guide. Saved in your browser only."
                : "Answers pick the prompts, skills and MCP configs for your stack and fill values like {{database}} into copied prompts. Saved in your browser only."
            }
          />
          <PlaybookIntakeForm
            playbookSlug={playbook.slug}
            intakeFields={playbook.intakeFields}
            firstStepHref={isGuideMode ? null : `/playbook/${playbook.slug}/step/1`}
          />
        </section>

        {!isGuideMode ? (
          <aside className="lg:sticky lg:top-20 lg:self-start">
            <SectionHeading eyebrow="Roadmap" title="Steps you'll go through" />
            <ol className="relative space-y-2 before:absolute before:bottom-4 before:left-[15px] before:top-4 before:w-px before:bg-border">
              {playbook.steps.map((s, i) => (
                <li key={s.number} style={{ "--i": i } as React.CSSProperties} className="stagger animate-fade-up">
                  <Link
                    href={`/playbook/${playbook.slug}/step/${s.number}`}
                    className="group relative flex items-start gap-3 rounded-lg p-1.5 transition-colors hover:bg-muted/60"
                  >
                    <span className="relative z-10 inline-flex size-[18px] shrink-0 translate-x-[6px] translate-y-0.5 items-center justify-center rounded-full border bg-background font-mono text-[9px] text-muted-foreground transition-colors group-hover:border-primary group-hover:text-primary">
                      {s.number}
                    </span>
                    <span className="min-w-0 flex-1 pl-1.5">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="text-[13px] font-semibold leading-snug group-hover:text-primary">{s.title}</span>
                        {s.estimatedTime ? (
                          <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">{s.estimatedTime}</span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{s.description}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </aside>
        ) : null}
      </div>

      {isGuideMode ? (
        <article className="prose surface mt-6 max-w-4xl p-6 sm:p-8">
          <MDXContent source={playbook.body} />
        </article>
      ) : null}
    </div>
  );
}
