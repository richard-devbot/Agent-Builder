"use client";

/**
 * Step 1 — Discovery. A chat with the Discovery agent (materials analysis,
 * follow-up questions, clarifications) beside an agent workspace showing the
 * agent team at work, the live brief and the solution blueprint.
 */

import { useState } from "react";
import { AlertCircle, Cpu, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { StepHeader } from "./primitives";
import { ChatPanel } from "./intake/chat-panel";
import { WorkspacePanel, type WorkspaceTab } from "./intake/workspace-panel";
import type { KitBuilderState } from "./use-kit-builder-state";

export function StepDiscovery({ s }: { s: KitBuilderState }) {
  const { intake } = s;
  const [tab, setTab] = useState<WorkspaceTab>("pipeline");

  return (
    <>
      <StepHeader
        n={1}
        actions={
          <>
            <AiStatus intake={intake} />
            {intake.hasContent && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (window.confirm("Clear the conversation, materials, brief and blueprint?")) {
                    intake.reset();
                    setTab("pipeline");
                  }
                }}
              >
                <RotateCcw className="size-3.5" /> Start over
              </Button>
            )}
          </>
        }
      />

      {intake.error && (
        <div role="alert" className="flex animate-fade-in items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <p className="flex-1">{intake.error}</p>
          <button type="button" onClick={() => intake.setError(null)} aria-label="Dismiss" className="rounded p-0.5 text-muted-foreground hover:text-foreground">
            <X className="size-3.5" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 @5xl:grid-cols-[minmax(0,1fr)_24rem] @[90rem]:grid-cols-[minmax(0,1fr)_30rem]">
        <ChatPanel intake={intake} onOpenBlueprint={() => setTab("blueprint")} />
        <WorkspacePanel s={s} tab={tab} onTab={setTab} />
      </div>
    </>
  );
}

function AiStatus({ intake }: { intake: KitBuilderState["intake"] }) {
  if (!intake.ai) return null;
  const on = intake.ai.configured;
  const auth = { "api-key": "API key", "service-account": "OAuth service account", adc: "OAuth (ADC)", none: "" }[intake.ai.auth];
  return (
    <span
      className={cn("inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs", on ? "border-success/30 bg-success/5 text-success" : "text-muted-foreground")}
      title={
        on
          ? `${intake.ai.provider === "vertex-ai" ? "Vertex AI" : "Gemini API"} · ${auth} · instructions v${intake.ai.instructionsVersion}`
          : "Set GOOGLE_GENAI_USE_VERTEXAI=true and GOOGLE_CLOUD_PROJECT with OAuth credentials (or GEMINI_API_KEY) on the server"
      }
    >
      <Cpu className="size-3.5" />
      {on ? `Gemini · ${intake.ai.model}` : "Guided mode · AI not connected"}
    </span>
  );
}
