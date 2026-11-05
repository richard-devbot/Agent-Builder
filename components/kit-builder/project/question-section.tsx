"use client";

/**
 * One card of project questions: icon header with progress, inline summary chips
 * of selected answers + Discovery context when collapsed, and Discovery-grounded
 * callouts + answer tiles when expanded.
 */

import { Check, ChevronDown, Compass, FileText, Gauge, Rocket, Route, Sparkles, Target, Code2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { SECTION_LABEL, type ProjectQuestion, type ProjectQuestionSection } from "@/lib/kit/project-questions";
import type { KitBuilderState } from "../use-kit-builder-state";

export const SECTION_ORDER: ProjectQuestionSection[] = ["starting-point", "scope", "codebase", "migration", "delivery", "quality", "notes"];

const SECTION_ICON: Record<ProjectQuestionSection, typeof Compass> = {
  "starting-point": Compass,
  scope: Target,
  codebase: Code2,
  migration: Route,
  delivery: Rocket,
  quality: Gauge,
  notes: FileText,
};

export const answered = (s: KitBuilderState, q: ProjectQuestion) => (s.projectAnswers[q.id] ?? []).some((v) => v.trim());

function summarizeAnswer(q: ProjectQuestion, values: string[]): string {
  if (!q.options) {
    const raw = values[0]?.trim() ?? "";
    if (!raw) return "";
    const firstLine = raw.split("\n")[0] ?? raw;
    return firstLine.length > 70 ? `${firstLine.slice(0, 67)}…` : firstLine;
  }
  return values
    .map((id) => q.options?.find((o) => o.id === id)?.label)
    .filter(Boolean)
    .join(", ");
}

function sectionDiscoveryContext(s: KitBuilderState, section: ProjectQuestionSection): {
  subtitle: string;
  highlights: string[];
} {
  const { brief, materials, liveAdk, hasContent } = s.intake;
  const fallbackSubtitle = SECTION_LABEL[section].blurb;
  if (!hasContent) {
    return { subtitle: fallbackSubtitle, highlights: [] };
  }

  switch (section) {
    case "starting-point": {
      const docs = materials.map((m) => m.name);
      const sys = brief.systems.map((sy) => sy.name);
      const highlights: string[] = [];
      if (docs.length > 0) highlights.push(`Uploaded docs: ${docs.join(", ")}`);
      if (sys.length > 0) highlights.push(`Detected systems: ${sys.join(", ")}`);
      if (brief.problem.trim()) highlights.push(`Baseline problem: ${brief.problem.trim()}`);
      const subtitle =
        docs.length > 0 || sys.length > 0
          ? `Grounded in ${[docs.length ? `${docs.length} uploaded doc${docs.length === 1 ? "" : "s"}` : "", sys.length ? sys.slice(0, 3).join(", ") : ""].filter(Boolean).join(" · ")}`
          : fallbackSubtitle;
      return { subtitle, highlights };
    }
    case "scope": {
      const stages = brief.inScope;
      const goals = brief.goals;
      const highlights: string[] = [];
      if (stages.length > 0) highlights.push(`Workflow stages: ${stages.join(" → ")}`);
      if (goals.length > 0) highlights.push(`Target outcomes: ${goals.join(" · ")}`);
      if (brief.users.length > 0) highlights.push(`Stakeholders: ${brief.users.join(", ")}${brief.audience ? ` (${brief.audience})` : ""}`);
      const subtitle =
        stages.length > 0
          ? `${stages.length} workflow stage${stages.length === 1 ? "" : "s"} & target outcomes for ${s.projectName || brief.title || "this project"}`
          : fallbackSubtitle;
      return { subtitle, highlights };
    }
    case "delivery": {
      const triggerKind = liveAdk.trigger?.kind ?? "chat_a2a";
      const specialistCount = liveAdk.agents.filter((a) => a.type === "llm").length;
      const highlights: string[] = [
        `Root ADK Orchestrator: ${liveAdk.rootAgent} (trigger: ${triggerKind}, ${specialistCount} LLM agents, ${liveAdk.tools.length} tools)`,
      ];
      if (brief.timeline.trim()) highlights.push(`Target timeline: ${brief.timeline.trim()}`);
      const subtitle = `ADK package ${liveAdk.packageName} · trigger: ${triggerKind} · ${s.deploymentSetup.deployTarget.replace(/_/g, " ")}`;
      return { subtitle, highlights };
    }
    case "quality": {
      const highlights: string[] = [];
      if (brief.dataCompliance.trim()) highlights.push(`Data & compliance: ${brief.dataCompliance.trim()}`);
      if (brief.constraints.length > 0) highlights.push(`Approval & guardrail rules: ${brief.constraints.join(" · ")}`);
      if (brief.successMetrics.length > 0) highlights.push(`Eval & success metrics: ${brief.successMetrics.join(" · ")}`);
      const subtitle = `Risk tier: ${(brief.riskTier || "low").toUpperCase()}${brief.dataCompliance.trim() ? ` · ${brief.dataCompliance.trim().slice(0, 60)}` : ""}`;
      return { subtitle, highlights };
    }
    case "notes": {
      const highlights: string[] = [];
      if (brief.outOfScope.length > 0) highlights.push(`Explicitly out of scope for v1: ${brief.outOfScope.join(" · ")}`);
      if (brief.openQuestions.length > 0) highlights.push(`Open questions: ${brief.openQuestions.join(" · ")}`);
      const subtitle = s.projectName
        ? `Compiled ground-truth context for ${s.projectName} (${liveAdk.packageName})`
        : fallbackSubtitle;
      return { subtitle, highlights };
    }
    default:
      return { subtitle: fallbackSubtitle, highlights: [] };
  }
}

export function QuestionSection({
  s,
  section,
  questions,
  index,
  open,
  onToggle,
}: {
  s: KitBuilderState;
  section: ProjectQuestionSection;
  questions: ProjectQuestion[];
  index: number;
  open: boolean;
  onToggle: () => void;
}) {
  const Icon = SECTION_ICON[section];
  const done = questions.filter((q) => answered(s, q)).length;
  const complete = done === questions.length;
  const ctx = sectionDiscoveryContext(s, section);
  const answeredSummaries = questions
    .map((q) => {
      const text = summarizeAnswer(q, s.projectAnswers[q.id] ?? []);
      return text ? { id: q.id, label: q.label, text } : null;
    })
    .filter((x): x is { id: string; label: string; text: string } => Boolean(x));

  return (
    <section
      id={`project-${section}`}
      style={{ "--i": index } as React.CSSProperties}
      className={cn(
        "stagger min-w-0 scroll-mt-4 animate-fade-up overflow-hidden rounded-2xl border bg-card/70 transition-colors",
        open && "border-[color-mix(in_oklch,var(--t)_35%,var(--border))]",
      )}
    >
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full flex-col gap-2.5 px-4 py-3.5 text-left">
        <div className="flex w-full items-center gap-3">
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors duration-300",
              complete ? "bg-success/15 text-success" : "bg-[color-mix(in_oklch,var(--t)_14%,transparent)] text-[var(--t)]",
            )}
          >
            {complete ? <Check className="size-4.5 animate-check" strokeWidth={2.5} /> : <Icon className="size-4.5" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{SECTION_LABEL[section].title}</span>
            <span className="block truncate text-xs text-muted-foreground">{ctx.subtitle}</span>
          </span>
          <span className="hidden items-center gap-2 sm:flex">
            <span className="flex gap-0.5">
              {questions.map((q) => (
                <span key={q.id} className={cn("h-1.5 w-4 rounded-full transition-colors duration-500", answered(s, q) ? "bg-[var(--t)]" : "bg-muted")} />
              ))}
            </span>
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {done}/{questions.length}
            </span>
          </span>
          <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-300", open && "rotate-180")} />
        </div>

        {/* When collapsed, show concrete selected answers right inside the card header so it never looks generic */}
        {!open && answeredSummaries.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pl-12">
            {answeredSummaries.map((item) => (
              <span
                key={item.id}
                className="inline-flex max-w-full items-center gap-1 rounded-md border border-border/70 bg-background/70 px-2 py-0.5 text-[11px]"
              >
                <span className="font-semibold text-foreground/85">{item.label}:</span>
                <span className="truncate text-muted-foreground">{item.text}</span>
              </span>
            ))}
          </div>
        )}
      </button>

      <div className={cn("grid transition-[grid-template-rows] duration-300 ease-out", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="min-h-0 overflow-hidden">
          <div className="space-y-5 border-t border-border/60 px-4 pt-4 pb-5">
            {ctx.highlights.length > 0 && (
              <div className="rounded-xl border border-primary/25 bg-primary/[0.04] px-3.5 py-2.5">
                <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
                  <Sparkles className="size-3" /> Captured from Discovery for {s.projectName || "this project"}
                </p>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {ctx.highlights.map((h) => (
                    <li key={h} className="leading-relaxed">
                      • {h}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {questions.map((q) => (
              <Question key={q.id} s={s} q={q} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Question({ s, q }: { s: KitBuilderState; q: ProjectQuestion }) {
  const answer = s.projectAnswers[q.id] ?? [];
  return (
    <div>
      <p className="mb-2.5 flex flex-wrap items-baseline gap-x-2 text-[13.5px] font-medium">
        {q.question}
        {q.multi && <span className="text-xs font-normal text-muted-foreground">Choose any</span>}
      </p>
      {q.options ? (
        <div role={q.multi ? "group" : "radiogroup"} aria-label={q.question} className="grid grid-cols-1 gap-2 @2xl:grid-cols-2 @6xl:grid-cols-3">
          {q.options.map((o) => {
            const on = answer.includes(o.id);
            return (
              <button
                key={o.id}
                type="button"
                role={q.multi ? "checkbox" : "radio"}
                aria-checked={on}
                onClick={() => s.setChoiceAnswer(q.id, o.id, Boolean(q.multi))}
                className={cn(
                  "group flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-[13px] transition-all duration-200 active:scale-[0.98]",
                  on
                    ? "border-[var(--t)] bg-[color-mix(in_oklch,var(--t)_10%,transparent)] font-medium shadow-sm"
                    : "bg-background/60 hover:border-[color-mix(in_oklch,var(--t)_45%,var(--border))]",
                )}
              >
                <span
                  className={cn(
                    "flex size-4.5 shrink-0 items-center justify-center border-2 transition-colors",
                    q.multi ? "rounded-md" : "rounded-full",
                    on ? "border-[var(--t)] bg-[var(--t)] text-white" : "border-input group-hover:border-[var(--t)]",
                  )}
                >
                  {on && <Check className="size-3 animate-check" strokeWidth={3.5} />}
                </span>
                <span className="min-w-0">{o.label}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <Textarea
          value={answer[0] ?? ""}
          onChange={(e) => s.setTextAnswer(q.id, e.target.value)}
          placeholder={q.placeholder}
          aria-label={q.question}
          className="min-h-24 text-sm"
        />
      )}
    </div>
  );
}
