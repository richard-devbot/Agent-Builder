import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Clock,
  ExternalLink,
  FileText,
  Plug,
  Sparkles,
  Star,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TYPE_LABEL } from "@/components/asset-card";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { SectionHeading } from "@/components/page-header";
import { DoneChecklist } from "@/components/playbook/done-checklist";
import { PlaybookProgressBar } from "@/components/playbook/progress-bar";
import {
  CopyPromptButton,
  MarkCompleteButton,
} from "@/components/playbook/step-runtime";
import {
  extractPromptBody,
  getAllAssets,
  getAllPlaybooks,
  getPlaybookBySlug,
} from "@/lib/content";
import type { Asset } from "@/lib/content";
import { cn } from "@/lib/utils";

type Params = { slug: string; stepNumber: string };

export async function generateStaticParams(): Promise<Params[]> {
  const playbooks = await getAllPlaybooks();
  const out: Params[] = [];
  for (const p of playbooks) {
    for (const s of p.steps) {
      out.push({ slug: p.slug, stepNumber: String(s.number) });
    }
  }
  return out;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug, stepNumber } = await params;
  const playbook = await getPlaybookBySlug(slug);
  if (!playbook) return {};
  const step = playbook.steps.find((s) => s.number === Number(stepNumber));
  if (!step) return {};
  return {
    title: `Step ${step.number}: ${step.title} · ${playbook.title}`,
    description: step.description,
  };
}

function hrefForAsset(a: Asset): string {
  if (a.type === "playbook") return `/playbook/${a.slug}`;
  return `/asset/${a.type}/${a.slug}`;
}

export default async function PlaybookStepPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug, stepNumber: stepNumberRaw } = await params;
  const playbook = await getPlaybookBySlug(slug);
  if (!playbook) notFound();

  const stepNumber = Number(stepNumberRaw);
  if (!Number.isInteger(stepNumber) || stepNumber < 1) notFound();
  const step = playbook.steps.find((s) => s.number === stepNumber);
  if (!step) notFound();

  // Resolve every asset slug referenced by this step to a real asset
  // (forward-looking refs that don't exist are skipped silently).
  const all = await getAllAssets();
  const bySlug = new Map<string, Asset>(all.map((a) => [a.slug, a]));

  const primary = bySlug.get(step.primaryAsset) ?? null; // schema guarantees non-null at build time
  const alternatives = (step.alternativeAssets ?? [])
    .map((alt) => ({ asset: bySlug.get(alt.slug) ?? null, when: alt.when }))
    .filter((x): x is { asset: Asset; when: string } => x.asset !== null);
  const skills = (step.relevantSkills ?? [])
    .map((s) => bySlug.get(s) ?? null)
    .filter((a): a is Asset => a !== null);
  const mcps = (step.relevantMcpConfigs ?? [])
    .map((s) => bySlug.get(s) ?? null)
    .filter((a): a is Asset => a !== null);

  const stepsForBar = playbook.steps.map((s) => ({
    number: s.number,
    title: s.title,
  }));
  const isLastStep = stepNumber === playbook.steps.length;

  return (
    <div className="container-page py-6">
      <Breadcrumbs
        items={[
          { label: "Playbooks", href: "/playbooks" },
          { label: playbook.title, href: `/playbook/${playbook.slug}` },
          { label: `Step ${stepNumber}` },
        ]}
      />

      <div className="sticky top-14 z-30 -mx-1 mt-3 bg-background/80 px-1 py-2 backdrop-blur-md">
        <PlaybookProgressBar playbookSlug={playbook.slug} steps={stepsForBar} currentStep={stepNumber} />
      </div>

      <header className="mt-4 animate-fade-up">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="secondary" className="tabular-nums">
            Step {String(stepNumber).padStart(2, "0")} of {playbook.steps.length}
          </Badge>
          {step.estimatedTime ? (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Clock className="size-3" aria-hidden /> {step.estimatedTime}
            </span>
          ) : null}
          <span className="capitalize text-muted-foreground">· {playbook.difficulty}</span>
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{step.title}</h1>
        <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground sm:text-[15px]">{step.description}</p>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-8">
          <div className="surface relative overflow-hidden border-l-2 border-l-primary p-4">
            <p className="eyebrow">What you&apos;re doing</p>
            <p className="mt-1.5 text-sm leading-relaxed">{step.whatYoureDoing}</p>
          </div>

          <section aria-labelledby="rec-prompts-heading">
            <SectionHeading
              eyebrow="Recommended prompts"
              title="Do the work in your IDE"
              description="Copy fills in your stack values; paste into Claude Code, Cursor or Copilot."
            />
            <div className="space-y-2.5">
              {primary ? (
                <RecommendationCard asset={primary} playbookSlug={playbook.slug} isPrimary index={0} />
              ) : null}
              {alternatives.map(({ asset, when }, i) => (
                <RecommendationCard
                  key={`${asset.type}:${asset.slug}`}
                  asset={asset}
                  when={when}
                  playbookSlug={playbook.slug}
                  index={i + 1}
                />
              ))}
              {alternatives.length === 0 && primary == null ? (
                <div className="rounded-lg border border-warning/30 bg-warning/8 px-3 py-2 text-xs text-warning">
                  No primary template configured for this step.
                </div>
              ) : null}
            </div>
          </section>

          {skills.length > 0 ? (
            <section aria-labelledby="rec-skills-heading">
              <SectionHeading
                eyebrow="Skills"
                title="Install for this phase"
                description="Skills trigger automatically on matching requests."
              />
              <div className="grid gap-2.5 xl:grid-cols-2">
                {skills.map((s, i) => (
                  <RecommendationCard key={`${s.type}:${s.slug}`} asset={s} playbookSlug={playbook.slug} index={i} compact />
                ))}
              </div>
            </section>
          ) : null}

          {mcps.length > 0 ? (
            <section aria-labelledby="rec-mcps-heading">
              <SectionHeading
                eyebrow="MCP configs"
                title="Connect these tools first"
                description="Gives the assistant direct access to Jira, browsers or databases."
              />
              <div className="grid gap-2.5 xl:grid-cols-2">
                {mcps.map((m, i) => (
                  <RecommendationCard key={`${m.type}:${m.slug}`} asset={m} playbookSlug={playbook.slug} index={i} compact />
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <aside className="space-y-6 lg:sticky lg:top-36 lg:self-start">
          <section aria-labelledby="dod-heading">
            <SectionHeading
              eyebrow="Definition of done"
              title="Check before moving on"
              description="Ticks are saved in your browser."
            />
            <DoneChecklist playbookSlug={playbook.slug} stepNumber={stepNumber} items={step.definitionOfDone} />
          </section>

          {step.commonPitfalls && step.commonPitfalls.length > 0 ? (
            <section aria-labelledby="pitfalls-heading">
              <SectionHeading eyebrow="Pitfalls" title="What goes wrong here" />
              <ul className="space-y-1.5">
                {step.commonPitfalls.map((p, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2.5 rounded-lg border border-warning/25 bg-warning/6 px-3 py-2 text-[13px]"
                  >
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>

      <div className="sticky bottom-3 z-20 mt-10 flex items-center justify-between gap-3 rounded-xl border bg-card/90 p-2.5 shadow-lg shadow-black/10 backdrop-blur-md">
        {stepNumber > 1 ? (
          <Button
            variant="outline"
            render={<Link href={`/playbook/${playbook.slug}/step/${stepNumber - 1}`} />}
          >
            <ArrowLeft className="size-3.5" /> Previous
          </Button>
        ) : (
          <Button variant="ghost" render={<Link href={`/playbook/${playbook.slug}`} />}>
            <ArrowLeft className="size-3.5" /> Intake
          </Button>
        )}
        <MarkCompleteButton playbookSlug={playbook.slug} stepNumber={stepNumber} isLastStep={isLastStep} />
      </div>
    </div>
  );
}

function RecommendationCard({
  asset,
  when,
  isPrimary,
  compact,
  playbookSlug,
  index,
}: {
  asset: Asset;
  when?: string;
  isPrimary?: boolean;
  compact?: boolean;
  playbookSlug: string;
  index: number;
}) {
  const promptBody = asset.type === "template" ? extractPromptBody(asset.body) : null;
  const copyLabel =
    asset.type === "template" ? "Copy prompt" : asset.type === "skill" ? "Copy skill" : "Copy config";
  const TypeIcon = asset.type === "skill" ? Sparkles : asset.type === "mcp-config" ? Plug : FileText;

  return (
    <div
      style={{ "--i": index } as React.CSSProperties}
      className={cn(
        "surface stagger card-hover flex animate-fade-up flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between",
        isPrimary && "border-primary/40 bg-primary/5",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          {isPrimary ? (
            <Badge className="gap-1">
              <Star className="size-3 fill-current" aria-hidden /> Primary
            </Badge>
          ) : (
            <span className="inline-flex items-center gap-1 font-medium text-muted-foreground">
              <TypeIcon className="size-3.5 text-primary" aria-hidden /> {TYPE_LABEL[asset.type]}
            </span>
          )}
          {asset.estimatedTime ? (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Clock className="size-3" aria-hidden /> {asset.estimatedTime}
            </span>
          ) : null}
        </div>
        <h3 className="mt-1.5 text-sm font-semibold">{asset.title}</h3>
        <p className={cn("mt-0.5 text-xs leading-relaxed text-muted-foreground", compact && "line-clamp-2")}>
          {asset.description}
        </p>
        {when ? (
          <p className="mt-1.5 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Use when:</span> {when}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1.5 sm:flex-col sm:items-stretch">
        {promptBody ? (
          <CopyPromptButton
            playbookSlug={playbookSlug}
            promptTemplate={promptBody}
            label={copyLabel}
            variant={isPrimary ? "default" : "outline"}
          />
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5"
          render={<Link href={hrefForAsset(asset)} target="_blank" rel="noreferrer noopener" />}
        >
          Open <ExternalLink className="size-3" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
