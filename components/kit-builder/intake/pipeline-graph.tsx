"use client";

/**
 * Live view of the Discovery agent team, modelled on bleachAgentBuilder's
 * orchestrator → sub-agent pipeline. Each node lights up as its stage runs.
 */

import { Bot, Boxes, ClipboardList, FileSearch, MessagesSquare, PackageCheck, Workflow } from "lucide-react";
import { cn } from "@/lib/utils";
import type { IntakeState } from "./use-intake";

type Status = "idle" | "running" | "done";

type Stage = { id: string; title: string; role: string; icon: typeof Bot; status: Status; detail: string };

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
      status: i.busy === "analyzing" || i.busy === "reading" ? "running" : analyzed ? "done" : "idle",
      detail: analyzed ? `${analyzed} item${analyzed === 1 ? "" : "s"} analysed` : "Waiting for materials",
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
      status: i.busy === "thinking" ? "running" : i.done ? "done" : asked ? "running" : "idle",
      detail: asked ? `${i.answers.length} answers over ${asked} round${asked === 1 ? "" : "s"}` : "Starts after your first message",
    },
    {
      id: "architect",
      title: "Solution Architect",
      role: "Stack, milestones, reusable skills",
      icon: Workflow,
      status: i.busy === "planning" ? "running" : i.plan ? "done" : "idle",
      detail: i.plan ? `${i.plan.milestones.length} milestones · ${i.plan.technologies.length} technologies` : "Runs when you build the blueprint",
    },
    {
      id: "builder",
      title: "Agent & Skill Builder",
      role: "Drafts custom agents and skills",
      icon: Boxes,
      status: i.busy === "planning" ? "running" : drafts ? "done" : "idle",
      detail: drafts ? `${drafts} draft${drafts === 1 ? "" : "s"} ready to review` : i.plan ? "No custom drafts (guided plan)" : "Runs with the architect",
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
  const list = stages(intake);
  return (
    <div className="p-4">
      <div className="mb-4 flex items-center gap-3 rounded-xl border bg-gradient-to-br from-primary/10 to-transparent p-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand-2 text-primary-foreground shadow-md shadow-primary/25">
          <Bot className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">Discovery orchestrator</p>
          <p className="text-[11px] text-muted-foreground">
            Instructions v{intake.ai?.instructionsVersion ?? "…"} · {intake.ai?.configured ? `${intake.ai.provider === "vertex-ai" ? "Vertex AI" : "Gemini API"}, ${intake.ai.model}` : "guided mode"}
          </p>
        </div>
      </div>

      <ol className="relative">
        {list.map((s, i) => {
          const Icon = s.icon;
          const next = list[i + 1];
          return (
            <li key={s.id} className="relative pb-3 pl-12 last:pb-0">
              {next && (
                <span aria-hidden className="absolute top-10 bottom-0 left-[1.15rem] w-0.5 overflow-hidden rounded-full bg-border">
                  {/* Flowing pulse on the edge into a running stage. */}
                  <span
                    className={cn(
                      "absolute inset-x-0 top-0 h-full transition-colors duration-500",
                      s.status === "done" ? "bg-success/60" : "bg-transparent",
                      next.status === "running" && "animate-[pipeline-flow_1.2s_linear_infinite] bg-[linear-gradient(to_bottom,transparent,var(--primary),transparent)] bg-[length:100%_200%]",
                    )}
                  />
                </span>
              )}
              <span
                className={cn(
                  "absolute top-1 left-0 flex size-9 items-center justify-center rounded-xl border transition-all duration-500",
                  s.status === "running" && "scale-105 border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/40",
                  s.status === "done" && "border-success/40 bg-success/12 text-success",
                  s.status === "idle" && "bg-muted text-muted-foreground",
                )}
              >
                <Icon className="size-4" />
                {s.status === "running" && <span className="absolute inset-0 animate-ping rounded-xl bg-primary/30" />}
              </span>
              <div
                className={cn(
                  "rounded-xl border p-3 transition-colors duration-500",
                  s.status === "running" ? "border-primary/50 bg-primary/[0.06]" : s.status === "done" ? "bg-card/80" : "bg-background/40",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13px] font-semibold">{s.title}</p>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider",
                      s.status === "running" ? "bg-primary/15 text-primary" : s.status === "done" ? "bg-success/12 text-success" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {s.status === "running" ? "Working" : s.status === "done" ? "Done" : "Idle"}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">{s.role}</p>
                <p className="mt-1.5 font-mono text-[11px]">{s.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
