"use client";

/**
 * Live view of the Discovery agent team + real-time Google ADK Flow preview.
 * Lets users switch between the live ADK multi-agent flow canvas (synthesized
 * from their Discovery brief as they chat) and the Discovery orchestrator stages,
 * or launch the full-screen ADK Studio at any time.
 */

import { useState } from "react";
import {
  Bot,
  Boxes,
  ClipboardList,
  Download,
  FileSearch,
  Maximize2,
  MessagesSquare,
  Network,
  PackageCheck,
  Plug,
  PlugZap,
  RefreshCw,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AdkFlow } from "./adk-flow";
import {
  BlueprintStudio,
  downloadAdk,
  type BlueprintStudioPane,
} from "./blueprint-studio";
import type { IntakeState } from "./use-intake";

type Status = "idle" | "running" | "done";

type Stage = {
  id: string;
  title: string;
  role: string;
  icon: typeof Bot;
  status: Status;
  detail: string;
};

function stages(i: IntakeState): Stage[] {
  const analyzed = i.analyzed.length;
  const asked = i.messages.filter((m) => m.role === "agent" && m.kind === "questions").length;
  const drafts = i.plan ? i.plan.customAgents.length + i.plan.customSkills.length : 0;
  return [
    {
      id: "analyst",
      title: "Material Analyst",
      role: "Reads every shared document first",
      icon: FileSearch,
      status:
        i.busy === "analyzing" || i.busy === "reading"
          ? "running"
          : analyzed
            ? "done"
            : "idle",
      detail: analyzed
        ? `${analyzed} item${analyzed === 1 ? "" : "s"} analysed`
        : "Waiting for materials",
    },
    {
      id: "requirements",
      title: "Requirements Analyst",
      role: "Keeps the brief honest and current",
      icon: ClipboardList,
      status: i.busy === "thinking" ? "running" : i.score > 0 ? "done" : "idle",
      detail: i.score ? `Brief ${i.score}% complete` : "No brief yet",
    },
    {
      id: "clarifier",
      title: "Clarifier",
      role: "Asks only what's missing",
      icon: MessagesSquare,
      status:
        i.busy === "thinking"
          ? "running"
          : i.done
            ? "done"
            : asked
              ? "running"
              : "idle",
      detail: asked
        ? `${i.answers.length} answers over ${asked} round${asked === 1 ? "" : "s"}`
        : "Starts after your first message",
    },
    {
      id: "architect",
      title: "Solution Architect",
      role: "Stack, milestones, reusable skills & ADK flow",
      icon: Workflow,
      status:
        i.busy === "planning"
          ? "running"
          : i.plan || i.score > 0
            ? "done"
            : "idle",
      detail: i.plan
        ? `${i.plan.milestones.length} milestones · ${i.liveAdk.agents.length} ADK agents`
        : `${i.liveAdk.agents.length} live ADK agents · ${i.liveAdk.tools.length} tools`,
    },
    {
      id: "builder",
      title: "Agent & Skill Builder",
      role: "Drafts custom agents, connectors and skills",
      icon: Boxes,
      status:
        i.busy === "planning"
          ? "running"
          : drafts || i.liveAdk.tools.length > 0
            ? "done"
            : "idle",
      detail: drafts
        ? `${drafts} draft${drafts === 1 ? "" : "s"} ready to review`
        : `${i.liveAdk.tools.length} ADK tools & ${i.liveAdk.envVars.length} env bindings ready`,
    },
    {
      id: "assembler",
      title: "Kit Assembler",
      role: "Feeds the plan into steps 2–5",
      icon: PackageCheck,
      status: i.applied ? "done" : "idle",
      detail: i.applied ? "Applied to the kit" : "Waiting for you to apply",
    },
  ];
}

export function PipelineGraph({ intake }: { intake: IntakeState }) {
  const [subView, setSubView] = useState<"adk" | "stages">("adk");
  const [studioOpen, setStudioOpen] = useState(false);
  const [studioPane, setStudioPane] = useState<BlueprintStudioPane>("graph");
  const list = stages(intake);
  const adk = intake.liveAdk;

  const openStudioAt = (pane: BlueprintStudioPane) => {
    setStudioPane(pane);
    setStudioOpen(true);
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-gradient-to-br from-primary/10 to-transparent p-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand-2 text-primary-foreground shadow-md shadow-primary/25">
            <Bot className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Discovery & Live ADK Flow</p>
            <p className="text-[11px] text-muted-foreground">
              {adk.agents.length} agents · {adk.tools.length} tools ·{" "}
              {adk.envVars.length} env/secrets ·{" "}
              {intake.ai?.configured
                ? `${intake.ai.provider === "vertex-ai" ? "Vertex AI" : "Gemini API"}`
                : "guided mode"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 rounded-lg border bg-background/80 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setSubView("adk")}
            className={cn(
              "rounded-md px-2.5 py-1 text-[11.5px] font-medium transition-colors",
              subView === "adk"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Live ADK Flow
          </button>
          <button
            type="button"
            onClick={() => setSubView("stages")}
            className={cn(
              "rounded-md px-2.5 py-1 text-[11.5px] font-medium transition-colors",
              subView === "stages"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Discovery Stages
          </button>
        </div>
      </div>

      {subView === "adk" ? (
        <div className="overflow-hidden rounded-xl border border-primary/30 bg-card/80">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-muted/20 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold">{adk.title}</p>
              <p className="truncate font-mono text-[10.5px] text-muted-foreground">
                {adk.packageName} · root: {adk.rootAgent}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px]"
                onClick={intake.resyncAdkFromBrief}
                title="Re-synthesize ADK flow from current Discovery brief"
              >
                <RefreshCw className="size-3" /> Sync
              </Button>
              <Button
                size="sm"
                className="h-7 px-2.5 text-[11px]"
                onClick={() => openStudioAt("graph")}
              >
                <Maximize2 className="size-3" /> Open Studio
              </Button>
            </div>
          </div>

          <div
            onClick={() => openStudioAt("graph")}
            className="h-80 cursor-zoom-in bg-muted/10 transition-colors hover:bg-muted/25"
          >
            <AdkFlow
              project={adk}
              interactive={false}
              showTools={true}
              view="simple"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 bg-muted/15 p-2.5">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px]"
              onClick={() => openStudioAt("tools")}
            >
              <Plug className="size-3 text-info" /> Tools, MCP & Skills ({adk.tools.length})
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px]"
              onClick={() => openStudioAt("connections")}
            >
              <PlugZap className="size-3 text-warning" /> Connections & Env ({adk.envVars.length})
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto h-7 text-[11px]"
              onClick={() => downloadAdk(adk)}
            >
              <Download className="size-3" /> Zip
            </Button>
          </div>
        </div>
      ) : (
        <ol className="relative">
          {list.map((s, i) => {
            const Icon = s.icon;
            const next = list[i + 1];
            return (
              <li key={s.id} className="relative pb-3 pl-12 last:pb-0">
                {next && (
                  <span
                    aria-hidden
                    className="absolute top-10 bottom-0 left-[1.15rem] w-0.5 overflow-hidden rounded-full bg-border"
                  >
                    <span
                      className={cn(
                        "absolute inset-x-0 top-0 h-full transition-colors duration-500",
                        s.status === "done" ? "bg-success/60" : "bg-transparent",
                        next.status === "running" &&
                          "animate-[pipeline-flow_1.2s_linear_infinite] bg-[linear-gradient(to_bottom,transparent,var(--primary),transparent)] bg-[length:100%_200%]",
                      )}
                    />
                  </span>
                )}
                <span
                  className={cn(
                    "absolute top-1 left-0 flex size-9 items-center justify-center rounded-xl border transition-all duration-500",
                    s.status === "running" &&
                      "scale-105 border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/40",
                    s.status === "done" &&
                      "border-success/40 bg-success/12 text-success",
                    s.status === "idle" && "bg-muted text-muted-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {s.status === "running" && (
                    <span className="absolute inset-0 animate-ping rounded-xl bg-primary/30" />
                  )}
                </span>
                <div
                  className={cn(
                    "rounded-xl border p-3 transition-colors duration-500",
                    s.status === "running"
                      ? "border-primary/50 bg-primary/[0.06]"
                      : s.status === "done"
                        ? "bg-card/80"
                        : "bg-background/40",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[13px] font-semibold">{s.title}</p>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider",
                        s.status === "running"
                          ? "bg-primary/15 text-primary"
                          : s.status === "done"
                            ? "bg-success/12 text-success"
                            : "bg-muted text-muted-foreground",
                      )}
                    >
                      {s.status === "running"
                        ? "Working"
                        : s.status === "done"
                          ? "Done"
                          : "Idle"}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{s.role}</p>
                  <p className="mt-1.5 font-mono text-[11px]">{s.detail}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <BlueprintStudio
        key={studioPane}
        project={adk}
        brief={intake.brief}
        open={studioOpen}
        onOpenChange={setStudioOpen}
        onChange={intake.updateAdk}
        initialPane={studioPane}
      />
    </div>
  );
}
