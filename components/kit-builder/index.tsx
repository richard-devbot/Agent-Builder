"use client";

/**
 * Kit Studio workspace. On large screens it fills the viewport below the site
 * header as three independently scrolling panes: step navigator, step canvas,
 * and a live kit manifest. Below `lg` it collapses to one column with a
 * horizontal step strip and the manifest in a sheet.
 */

import { useEffect, useRef } from "react";
import { ArrowLeft, ArrowRight, Download, FolderTree } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { KitSkill } from "@/lib/kit/skills";
import type { KitMcpServer } from "@/lib/kit/mcp-servers";
import { useKitBuilderState } from "./use-kit-builder-state";
import { STEPS } from "./primitives";
import { StudioNav } from "./studio-nav";
import { KitManifest } from "./kit-manifest";
import { KitDialogs } from "./kit-dialogs";
import { StepStack } from "./step-stack";
import { StepOrg } from "./step-org";
import { StepProject } from "./step-project";
import { StepDiscovery } from "./step-discovery";
import { StepReview } from "./step-review";

export function KitBuilder({
  skills,
  mcpServers,
}: {
  skills: KitSkill[];
  mcpServers: KitMcpServer[];
}) {
  const s = useKitBuilderState({ skills, mcpServers });
  const canvasRef = useRef<HTMLDivElement>(null);
  const discovery = s.step === 1;

  // Each step starts at the top of the canvas (and of the page on mobile).
  useEffect(() => {
    canvasRef.current?.scrollTo({ top: 0 });
    if (window.innerWidth < 1024) window.scrollTo({ top: 0 });
  }, [s.step]);

  // Steps stay mounted (they hold local UI state); toggling `hidden` restarts the
  // CSS entrance animation each time a step becomes visible.
  const stepClass = (n: number) => cn("flex animate-fade-up flex-col gap-5", s.step !== n && "hidden");

  return (
    <div
      className={cn(
        "grid grid-cols-1 lg:h-[calc(100dvh-3.5rem)]",
        // Discovery gives the manifest's column to the chat and agent workspace.
        discovery ? "lg:grid-cols-[16rem_minmax(0,1fr)] 2xl:grid-cols-[17rem_minmax(0,1fr)]" : "lg:grid-cols-[16rem_minmax(0,1fr)_20rem] 2xl:grid-cols-[17rem_minmax(0,1fr)_24rem]",
      )}
    >
      {/* Left rail */}
      <aside className="hidden min-h-0 overflow-y-auto border-r border-border/60 bg-surface/50 lg:block">
        <StudioNav s={s} />
      </aside>

      {/* Canvas */}
      <div ref={canvasRef} className="@container relative flex min-h-0 min-w-0 flex-col lg:overflow-y-auto">
        <MobileSteps s={s} />
        <div className="flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
          <div className={stepClass(1)}>
            <StepDiscovery s={s} />
          </div>
          <div className={stepClass(2)}>
            <StepOrg s={s} />
          </div>
          <div className={stepClass(3)}>
            <StepProject s={s} />
          </div>
          <div className={stepClass(4)}>
            <StepStack s={s} />
          </div>
          <div className={stepClass(5)}>
            <StepReview s={s} />
          </div>
        </div>
        <StepFooter s={s} />
      </div>

      {/* Right rail */}
      <aside className={cn("hidden min-h-0 border-l border-border/60 bg-surface/50", !discovery && "lg:block")}>
        <KitManifest s={s} />
      </aside>

      <KitDialogs s={s} />
    </div>
  );
}

/** Horizontal step strip shown instead of the left rail on small screens. */
function MobileSteps({ s }: { s: ReturnType<typeof useKitBuilderState> }) {
  return (
    <nav aria-label="Kit builder steps" className="sticky top-14 z-20 border-b border-border/60 bg-background/85 backdrop-blur-md lg:hidden">
      <ol className="flex gap-1 overflow-x-auto px-3 py-2 [scrollbar-width:none]">
        {STEPS.map((step) => {
          const active = step.n === s.step;
          return (
            <li key={step.n} className="shrink-0">
              <button
                type="button"
                onClick={() => s.setStep(step.n)}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors",
                  active ? "bg-primary text-primary-foreground" : step.n < s.step ? "bg-success/12 text-success" : "bg-muted text-muted-foreground",
                )}
              >
                <span className="font-mono text-[10px]">{step.n}</span>
                {step.label}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Back / continue bar pinned to the bottom of the canvas. */
function StepFooter({ s }: { s: ReturnType<typeof useKitBuilderState> }) {
  const next = STEPS[s.step];
  return (
    <div className="sticky bottom-0 z-20 border-t border-border/60 bg-background/85 px-4 py-2.5 backdrop-blur-md sm:px-6 lg:px-8">
      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => s.setStep(Math.max(1, s.step - 1))}
          disabled={s.step === 1}
        >
          <ArrowLeft className="size-3.5" /> Back
        </Button>

        {/* Segmented progress: one bar per step. */}
        <div className="hidden flex-1 items-center justify-center gap-3 sm:flex" aria-live="polite">
          <div className="flex gap-1">
            {STEPS.map((step) => (
              <span
                key={step.n}
                className={cn(
                  "h-1.5 w-8 rounded-full transition-colors duration-500",
                  step.n < s.step ? "bg-success/70" : step.n === s.step ? "bg-primary" : "bg-muted",
                )}
              />
            ))}
          </div>
          <span className="text-xs tabular-nums text-muted-foreground">
            {s.step}/{STEPS.length} · {STEPS[s.step - 1].label}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <Sheet>
            <SheetTrigger render={<Button variant="ghost" size="sm" className="lg:hidden" />}>
              <FolderTree className="size-3.5" /> {s.files.length}
            </SheetTrigger>
            <SheetContent side="right" className="w-[22rem] gap-0 p-0">
              <SheetTitle className="sr-only">Kit manifest</SheetTitle>
              <KitManifest s={s} />
            </SheetContent>
          </Sheet>
          {s.step === 1 && (
            <Button type="button" variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={() => s.setStep(3)}>
              Skip to project
            </Button>
          )}
          {next ? (
            <Button type="button" size="sm" onClick={() => s.setStep(next.n)}>
              {next.label} <ArrowRight className="size-3.5" />
            </Button>
          ) : (
            <Button type="button" size="sm" onClick={s.download}>
              <Download className="size-3.5" /> Generate kit
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
