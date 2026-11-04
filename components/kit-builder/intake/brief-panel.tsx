"use client";

/** Live discovery brief: completeness ring, every section, inline edits and export. */

import { useState } from "react";
import { Check, Download, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";
import type { BriefField } from "@/contracts/intake";
import { FIELD_META, briefMarkdown, isFilled } from "@/lib/intake/brief";
import { SystemsConnectionsPanel } from "./systems-panel";
import type { IntakeState } from "./use-intake";

function Ring({ value }: { value: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative size-16 shrink-0">
      <svg viewBox="0 0 64 64" className="size-16 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" className="stroke-muted" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          stroke="url(#brief-ring)"
          strokeDasharray={c}
          strokeDashoffset={c - (c * value) / 100}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
        <defs>
          <linearGradient id="brief-ring" x1="0" x2="1">
            <stop offset="0%" stopColor="var(--brand)" />
            <stop offset="100%" stopColor="var(--brand-2)" />
          </linearGradient>
        </defs>
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-sm font-semibold tabular-nums">{value}%</span>
    </div>
  );
}

export function BriefPanel({ intake }: { intake: IntakeState }) {
  const [editing, setEditing] = useState<BriefField | null>(null);
  const [draft, setDraft] = useState("");
  const { brief } = intake;
  const md = () =>
    briefMarkdown({ brief, role: intake.role, materials: intake.materials, answers: intake.answers, plan: intake.plan });

  const download = () => {
    const url = URL.createObjectURL(new Blob([md()], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "discovery-brief.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  const begin = (field: BriefField) => {
    const v = brief[field];
    setDraft(Array.isArray(v) ? v.join("\n") : v);
    setEditing(field);
  };

  return (
    <div aria-label="Discovery brief" className="min-w-0">
      <div className="relative border-b border-border/60 bg-gradient-to-br from-primary/10 to-transparent p-4">
        <div className="flex items-center gap-3">
          <Ring value={intake.score} />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Discovery brief</p>
            <p className="mt-0.5 line-clamp-2 text-sm font-semibold leading-snug">{brief.title || "Untitled problem"}</p>
          </div>
        </div>
        {brief.summary && <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{brief.summary}</p>}
        <div className="mt-3 flex gap-1.5">
          <Button size="sm" variant="outline" onClick={download} disabled={!intake.hasContent}>
            <Download className="size-3.5" /> Export .md
          </Button>
          {intake.hasContent && <CopyButton value={md()} size="sm" label="Copy" />}
        </div>
      </div>

      <ul className="divide-y divide-border/60">
        {(Object.keys(FIELD_META) as BriefField[]).map((field) => {
          const filled = isFilled(brief, field);
          const value = brief[field];
          return (
            <li key={field} className="group px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span
                  className={cn("size-2 shrink-0 rounded-full transition-colors duration-500", filled ? "bg-success" : "bg-muted-foreground/30")}
                  aria-hidden
                />
                <span className="flex-1 text-xs font-semibold">{FIELD_META[field].label}</span>
                {editing !== field && (
                  <button
                    type="button"
                    onClick={() => begin(field)}
                    aria-label={`Edit ${FIELD_META[field].label}`}
                    className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <Pencil className="size-3" />
                  </button>
                )}
              </div>
              {editing === field ? (
                <div className="mt-2 space-y-1.5">
                  <Textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    autoFocus
                    placeholder={Array.isArray(value) ? "One item per line" : ""}
                    className="min-h-20 text-xs"
                  />
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        intake.editBriefField(field, draft);
                        setEditing(null);
                      }}
                    >
                      <Check className="size-3.5" /> Save
                    </Button>
                  </div>
                </div>
              ) : filled ? (
                Array.isArray(value) ? (
                  <ul className="mt-1 ml-4 list-disc space-y-0.5 text-xs text-muted-foreground marker:text-border">
                    {value.map((v) => (
                      <li key={v}>{v}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 ml-4 line-clamp-4 text-xs whitespace-pre-line text-muted-foreground">{value}</p>
                )
              ) : (
                <p className="mt-0.5 ml-4 text-[11px] italic text-muted-foreground/70">Not captured yet</p>
              )}
            </li>
          );
        })}
        {brief.assumptions.length > 0 && (
          <li className="bg-info/5 px-4 py-2.5">
            <p className="text-xs font-semibold text-info">Assumptions</p>
            <ul className="mt-1 ml-4 list-disc space-y-0.5 text-xs text-muted-foreground">
              {brief.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </li>
        )}
        {brief.openQuestions.length > 0 && (
          <li className="bg-warning/5 px-4 py-2.5">
            <p className="text-xs font-semibold text-warning">Open questions</p>
            <ul className="mt-1 ml-4 list-disc space-y-0.5 text-xs text-muted-foreground">
              {brief.openQuestions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          </li>
        )}
      </ul>
      <div className="border-t border-border/60">
        <SystemsConnectionsPanel intake={intake} />
      </div>
    </div>
  );
}
