"use client";

/** One card of project questions: icon header with progress, then answer tiles or a text box per question. */

import { Check, ChevronDown, Compass, FileText, Gauge, Rocket, Route, Target, Code2 } from "lucide-react";
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
  return (
    <section
      id={`project-${section}`}
      style={{ "--i": index } as React.CSSProperties}
      className={cn("stagger min-w-0 scroll-mt-4 animate-fade-up overflow-hidden rounded-2xl border bg-card/70 transition-colors", open && "border-[color-mix(in_oklch,var(--t)_35%,var(--border))]")}
    >
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl transition-colors duration-300",
            complete ? "bg-success/15 text-success" : "bg-[color-mix(in_oklch,var(--t)_14%,transparent)] text-[var(--t)]",
          )}
        >
          {complete ? <Check className="size-5 animate-check" strokeWidth={2.5} /> : <Icon className="size-5" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{SECTION_LABEL[section].title}</span>
          <span className="block truncate text-xs text-muted-foreground">{SECTION_LABEL[section].blurb}</span>
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
      </button>
      <div className={cn("grid transition-[grid-template-rows] duration-300 ease-out", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="min-h-0 overflow-hidden">
          <div className="space-y-6 border-t border-border/60 px-4 pt-4 pb-5">
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
