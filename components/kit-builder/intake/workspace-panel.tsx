"use client";

/** Right-hand agent workspace: the agent team at work, the live brief, Systems & Connections, and the blueprint. */

import { ClipboardList, Network, PlugZap, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { BriefPanel } from "./brief-panel";
import { BlueprintView } from "./blueprint-view";
import { PipelineGraph } from "./pipeline-graph";
import { SystemsConnectionsPanel } from "./systems-panel";
import type { KitBuilderState } from "../use-kit-builder-state";

export type WorkspaceTab = "pipeline" | "brief" | "systems" | "blueprint";

export function WorkspacePanel({
  s,
  tab,
  onTab,
}: {
  s: KitBuilderState;
  tab: WorkspaceTab;
  onTab: (t: WorkspaceTab) => void;
}) {
  const { intake } = s;
  const systemsCount = intake.brief.systems?.length ?? 0;
  const tabs: {
    id: WorkspaceTab;
    label: string;
    icon: typeof Network;
    badge?: string;
  }[] = [
    {
      id: "pipeline",
      label: "ADK Flow & Team",
      icon: Network,
      badge: intake.hasAdkFlow ? String(intake.liveAdk.agents.length) : "0",
    },
    { id: "brief", label: "Brief", icon: ClipboardList, badge: `${intake.score}%` },
    {
      id: "systems",
      label: "Systems & Connections",
      icon: PlugZap,
      badge:
        systemsCount > 0
          ? String(systemsCount)
          : intake.hasAdkFlow && intake.liveAdk.envVars.length > 0
            ? String(intake.liveAdk.envVars.length)
            : undefined,
    },
    {
      id: "blueprint",
      label: "Blueprint",
      icon: Wand2,
      badge: intake.plan ? "ready" : intake.hasAdkFlow ? "live" : "idle",
    },
  ];
  return (
    <section
      aria-label="Agent workspace"
      className="@container flex min-h-[34rem] min-w-0 flex-col overflow-hidden rounded-2xl border bg-card/70 lg:h-[calc(100dvh-14.5rem)]"
    >
      <div
        role="tablist"
        aria-label="Workspace"
        className="flex flex-wrap gap-1 border-b border-border/60 bg-muted/30 p-1.5"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => onTab(t.id)}
            className={cn(
              "inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-[12px] font-medium transition-colors",
              tab === t.id
                ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <t.icon className={cn("size-3.5 shrink-0", tab === t.id && "text-primary")} />
            <span className="truncate">{t.label}</span>
            {t.badge && (
              <span
                className={cn(
                  "rounded px-1 font-mono text-[10px]",
                  tab === t.id ? "bg-primary/12 text-primary" : "bg-muted",
                )}
              >
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>
      <div
        key={tab}
        className="min-h-0 flex-1 animate-fade-in overflow-y-auto overscroll-contain"
      >
        {tab === "pipeline" && <PipelineGraph intake={intake} />}
        {tab === "brief" && <BriefPanel intake={intake} />}
        {tab === "systems" && <SystemsConnectionsPanel intake={intake} />}
        {tab === "blueprint" && <BlueprintView s={s} />}
      </div>
    </section>
  );
}
