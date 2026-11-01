"use client";

/**
 * Agent-team graph for the blueprint, in the spirit of bleachAgentBuilder's
 * visual agent graph: the kit's orchestrator on top, the drafted custom agents
 * below it, and the skills they use at the bottom. Connectors are SVG paths
 * measured from the rendered nodes, so the layout can wrap freely.
 */

import { useEffect, useRef, useState } from "react";
import { Bot, Layers, Sparkles, Workflow } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Plan } from "@/contracts/intake";

type Node = { id: string; label: string; sub: string; kind: "root" | "agent" | "skill" | "catalog" };
type Edge = { from: string; to: string; kind: "delegates" | "handoff" | "uses" };

function model(plan: Plan, catalogNames: Map<string, string>, accepted: string[]): { rows: Node[][]; edges: Edge[] } {
  const agents: Node[] = plan.customAgents.map((a) => ({ id: `agent:${a.name}`, label: a.title, sub: a.name, kind: "agent" }));
  const skills: Node[] = plan.customSkills.map((s) => ({ id: `skill:${s.name}`, label: s.title, sub: s.name, kind: "skill" }));
  // Show the ticked catalog skills too, so a guided plan still has a graph.
  const catalog: Node[] = plan.skills
    .flatMap((s) => s.skillIds)
    .filter((id) => accepted.includes(id))
    .slice(0, 6)
    .map((id) => ({ id, label: catalogNames.get(id) ?? id.split(":").pop() ?? id, sub: "catalog skill", kind: "catalog" }));

  const edges: Edge[] = [];
  const handedTo = new Set(plan.customAgents.flatMap((a) => a.handoffsTo));
  for (const a of plan.customAgents) {
    // The orchestrator delegates to agents nobody else hands work to.
    if (!handedTo.has(a.name)) edges.push({ from: "root", to: `agent:${a.name}`, kind: "delegates" });
    for (const h of a.handoffsTo) edges.push({ from: `agent:${a.name}`, to: `agent:${h}`, kind: "handoff" });
    for (const s of a.skills) edges.push({ from: `agent:${a.name}`, to: `skill:${s}`, kind: "uses" });
  }
  const usedSkills = new Set(plan.customAgents.flatMap((a) => a.skills));
  for (const s of plan.customSkills) if (!usedSkills.has(s.name)) edges.push({ from: "root", to: `skill:${s.name}`, kind: "uses" });
  for (const c of catalog) edges.push({ from: "root", to: c.id, kind: "uses" });

  const root: Node = { id: "root", label: "Orchestrator", sub: "plans · delegates · verifies", kind: "root" };
  return { rows: [[root], agents, [...skills, ...catalog]].filter((r) => r.length), edges };
}

const ICON = { root: Workflow, agent: Bot, skill: Sparkles, catalog: Layers } as const;

export function BlueprintGraph({ plan, catalogNames, accepted }: { plan: Plan; catalogNames: Map<string, string>; accepted: string[] }) {
  const { rows, edges } = model(plan, catalogNames, accepted);
  const wrap = useRef<HTMLDivElement>(null);
  const [paths, setPaths] = useState<{ d: string; kind: Edge["kind"] }[]>([]);
  const signature = JSON.stringify([rows.map((r) => r.map((n) => n.id)), edges]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => {
      const box = el.getBoundingClientRect();
      const at = (id: string) => el.querySelector<HTMLElement>(`[data-node="${CSS.escape(id)}"]`)?.getBoundingClientRect();
      const next: { d: string; kind: Edge["kind"] }[] = [];
      for (const e of edges) {
        const a = at(e.from);
        const b = at(e.to);
        if (!a || !b) continue;
        const ax = a.left + a.width / 2 - box.left;
        const bx = b.left + b.width / 2 - box.left;
        if (Math.abs(a.top - b.top) < 4) {
          // Same row (agent → agent handoff): arc below the two nodes.
          const y = a.bottom - box.top;
          next.push({ d: `M${ax},${y} C${ax},${y + 26} ${bx},${y + 26} ${bx},${y}`, kind: e.kind });
        } else {
          const ay = a.bottom - box.top;
          const by = b.top - box.top;
          const mid = (ay + by) / 2;
          next.push({ d: `M${ax},${ay} C${ax},${mid} ${bx},${mid} ${bx},${by}`, kind: e.kind });
        }
      }
      setPaths(next);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // Re-measure when the graph's shape changes; `edges` is rebuilt every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return (
    <div ref={wrap} className="relative overflow-hidden rounded-xl border bg-background/50 p-4">
      <div aria-hidden className="bg-grid pointer-events-none absolute inset-0 opacity-60" />
      <svg aria-hidden className="pointer-events-none absolute inset-0 size-full overflow-visible">
        {paths.map((p, i) => (
          <path
            key={i}
            d={p.d}
            fill="none"
            strokeWidth={p.kind === "handoff" ? 2 : 1.5}
            strokeDasharray={p.kind === "delegates" ? "5 4" : p.kind === "handoff" ? "2 4" : undefined}
            className={cn(
              "animate-[dash-flow_1.6s_linear_infinite]",
              p.kind === "handoff" ? "stroke-brand-2" : p.kind === "delegates" ? "stroke-primary/70" : "stroke-muted-foreground/40",
            )}
          />
        ))}
      </svg>
      <div className="relative flex flex-col gap-9">
        {rows.map((row, r) => (
          <div key={r} className="flex flex-wrap justify-center gap-x-3 gap-y-6">
            {row.map((n, i) => {
              const Icon = ICON[n.kind];
              return (
                <div
                  key={n.id}
                  data-node={n.id}
                  style={{ "--i": r * 3 + i } as React.CSSProperties}
                  className={cn(
                    "stagger flex max-w-44 animate-scale-in items-center gap-2 rounded-xl border px-2.5 py-2 shadow-sm",
                    n.kind === "root" && "border-primary/50 bg-primary text-primary-foreground shadow-primary/30",
                    n.kind === "agent" && "border-brand-2/40 bg-card",
                    n.kind === "skill" && "border-primary/30 bg-card",
                    n.kind === "catalog" && "border-dashed bg-card/80",
                  )}
                >
                  <Icon className={cn("size-4 shrink-0", n.kind === "agent" && "text-brand-2", (n.kind === "skill" || n.kind === "catalog") && "text-primary")} />
                  <span className="min-w-0">
                    <span className="block truncate text-[12px] font-semibold leading-tight" title={n.label}>
                      {n.label}
                    </span>
                    <span className={cn("block truncate font-mono text-[10px] leading-tight", n.kind === "root" ? "text-primary-foreground/75" : "text-muted-foreground")}>
                      {n.sub}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="relative mt-4 flex flex-wrap justify-center gap-3 text-[10px] text-muted-foreground">
        <Legend dash="5 4" className="stroke-primary/70" label="delegates" />
        <Legend dash="2 4" className="stroke-brand-2" label="hands off to" />
        <Legend className="stroke-muted-foreground/60" label="uses skill" />
      </div>
    </div>
  );
}

function Legend({ dash, className, label }: { dash?: string; className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg width="22" height="6" aria-hidden>
        <line x1="0" y1="3" x2="22" y2="3" strokeWidth="2" strokeDasharray={dash} className={className} />
      </svg>
      {label}
    </span>
  );
}
