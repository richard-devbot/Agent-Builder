"use client";

/**
 * "Review my kit" panel (discovery step) — sends the current selections and
 * the generated instruction-file draft to the kit-advisor Lambda and shows
 * severity-ranked suggestions plus unanswered questions.
 * Shown disabled when NEXT_PUBLIC_KIT_ADVISOR_API is not configured.
 */

import { useState } from "react";
import { ClipboardCheck, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { adviseKit, type KitAdvice } from "@/lib/kit/kit-advisor-client";

const SEVERITY_STYLES: Record<string, string> = {
  important: "bg-destructive/15 text-destructive",
  recommended: "bg-primary/15 text-primary",
  info: "bg-muted text-muted-foreground",
};

export function KitAdvisorPanel({
  technologies,
  projectType,
  answers,
  draftMarkdown,
  disabled = false,
}: {
  technologies: string[];
  projectType?: string;
  answers: Record<string, string>;
  draftMarkdown: string;
  disabled?: boolean;
}) {
  const [advice, setAdvice] = useState<KitAdvice | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function review() {
    setLoading(true);
    setError(null);
    try {
      setAdvice(
        await adviseKit({
          technologies,
          projectType,
          answers,
          draftMarkdown,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kit review failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="surface gap-0 p-4 ring-0">
      <div className="mb-2 flex items-center gap-2">
        <ClipboardCheck className="size-4 text-primary" />
        <span className="text-sm font-semibold">Review my kit</span>
        <Badge variant="secondary" className="text-[11px]">
          Beta
        </Badge>
      </div>
      <p className="mb-3 text-[13px] leading-relaxed text-muted-foreground">
        An AI reviewer checks your selections and the generated instruction
        file, flagging gaps and stack-specific improvements before you
        generate the kit.
      </p>

      <Button
        type="button"
        size="sm"
        onClick={review}
        disabled={disabled || !draftMarkdown || loading}
      >
        {loading ? (
          <>
            <Loader2 className="size-3.5 animate-spin" /> Reviewing…
          </>
        ) : (
          <>
            <ClipboardCheck className="size-3.5" /> Review configuration
          </>
        )}
      </Button>

      {disabled && (
        <p className="mt-2.5 inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground"><span className="size-1.5 rounded-full bg-warning" aria-hidden />
          Requires the kit-advisor service. Not connected in this environment.
        </p>
      )}

      {error && <p className="mt-2 text-[13px] text-destructive">{error}</p>}

      {advice && (
        <div className="mt-3 flex flex-col gap-2">
          {advice.suggestions.length === 0 &&
            advice.missingAnswers.length === 0 && (
              <p className="text-[13px] text-muted-foreground">
                No issues found — your configuration looks solid.
              </p>
            )}
          {advice.suggestions.map((sg, i) => (
            <div
              key={i}
              className="rounded-md border border-border/60 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${SEVERITY_STYLES[sg.severity] ?? SEVERITY_STYLES.info}`}
                >
                  {sg.severity}
                </span>
                <p className="text-[13px] font-medium">{sg.title}</p>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {sg.detail}
              </p>
            </div>
          ))}
          {advice.missingAnswers.length > 0 && (
            <div className="rounded-md border border-border/60 px-3 py-2">
              <p className="text-[13px] font-medium">Unanswered questions</p>
              <ul className="mt-1 list-disc pl-4 text-xs leading-relaxed text-muted-foreground">
                {advice.missingAnswers.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
