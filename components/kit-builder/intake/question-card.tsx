"use client";

/** One follow-up question with one-click suggested answers and a free-text field. */

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { FollowUpQuestion } from "@/contracts/intake";
import { FIELD_META } from "@/lib/intake/brief";
import { Chip } from "../primitives";

const parts = (s: string) => s.split(/,\s*/).map((x) => x.trim()).filter(Boolean);

export function QuestionCard({
  q,
  index,
  value,
  onChange,
  onEnter,
}: {
  q: FollowUpQuestion;
  index: number;
  value: string;
  onChange: (v: string) => void;
  onEnter: () => void;
}) {
  const picked = parts(value);
  const toggle = (s: string) => {
    if (!q.multi) return onChange(value === s ? "" : s);
    onChange((picked.includes(s) ? picked.filter((p) => p !== s) : [...picked, s]).join(", "));
  };
  const answered = value.trim().length > 0;
  return (
    <div
      style={{ "--i": index } as React.CSSProperties}
      className={cn(
        "stagger animate-fade-up rounded-xl border p-3.5 transition-colors duration-300",
        answered ? "border-primary/40 bg-primary/[0.05]" : "bg-background/60",
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-semibold transition-colors",
            answered ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
          )}
        >
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <p className="text-[13.5px] font-medium leading-snug">{q.question}</p>
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{FIELD_META[q.field].label}</span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{q.why}</p>
          {q.suggestions.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {q.suggestions.map((s) => (
                <Chip key={s} active={q.multi ? picked.includes(s) : value === s} onClick={() => toggle(s)}>
                  {s}
                </Chip>
              ))}
            </div>
          )}
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onEnter();
              }
            }}
            placeholder={q.multi ? "Pick any, or type your own (comma-separated)" : "Pick one, or type your own"}
            aria-label={q.question}
            className="mt-2.5 h-8 text-sm"
          />
        </div>
      </div>
    </div>
  );
}
