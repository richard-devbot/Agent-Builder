"use client";

/** Renders project questions as answer cards with token / free-text inputs. */

import { Check } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ProjectQuestion } from "@/lib/kit/project-questions";
import { Chip } from "./primitives";
import type { KitBuilderState } from "./use-kit-builder-state";

export function QuestionList({
  s,
  questions,
}: {
  s: KitBuilderState;
  questions: ProjectQuestion[];
}) {
  if (questions.length === 0) {
    return <p className="text-sm text-muted-foreground">No questions apply yet. Pick a project type or technologies to see follow-ups.</p>;
  }
  return (
    <div className="grid grid-cols-1 gap-3 @5xl:grid-cols-2">
      {questions.map((q) => {
        const answer = s.projectAnswers[q.id] ?? [];
        const done = answer.length > 0;
        return (
          <div
            key={q.id}
            className={cn(
              "rounded-lg border p-3.5 transition-colors",
              done ? "border-primary/30 bg-primary/[0.03]" : "bg-background/40",
              !q.options && "@5xl:col-span-2",
            )}
          >
            <p className="mb-2.5 flex items-start gap-2 text-[13px] font-medium leading-snug">
              <span
                className={cn(
                  "mt-px flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                  done ? "border-success bg-success text-background" : "border-input",
                )}
              >
                {done && <Check className="size-2.5 animate-check" strokeWidth={3.5} />}
              </span>
              <span>
                {q.question}
                {q.multi && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(choose any)</span>}
              </span>
            </p>
            {q.options && q.dropdown ? (
              <select
                value={answer[0] ?? ""}
                onChange={(e) => s.setChoiceAnswer(q.id, e.target.value, false)}
                aria-label={q.question}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <option value="" disabled>
                  Select…
                </option>
                {q.options.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : q.options ? (
              <div className="flex flex-wrap gap-1.5">
                {q.options.map((opt) => (
                  <Chip
                    key={opt.id}
                    active={answer.includes(opt.id)}
                    onClick={() => s.setChoiceAnswer(q.id, opt.id, Boolean(q.multi))}
                  >
                    {opt.label}
                  </Chip>
                ))}
              </div>
            ) : (
              <Textarea
                value={answer[0] ?? ""}
                onChange={(e) => s.setTextAnswer(q.id, e.target.value)}
                placeholder={q.placeholder}
                aria-label={q.question}
                className="min-h-[72px] text-sm"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
