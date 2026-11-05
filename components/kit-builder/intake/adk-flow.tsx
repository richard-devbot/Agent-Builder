"use client";

/**
 * Interactive canvas of a Google ADK agent system, inspired by CrewAI Studio v2
 * and built on React Flow: pan, zoom, drag nodes, minimap, trigger banner,
 * HITL confirmation gates, conditional route labels, and quick-add controls.
 *
 * Fully controlled: the layout is derived from the project; drags are kept as
 * position overrides, so edits elsewhere never reset the canvas.
 */

import { memo, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useTheme } from "next-themes";
import { Lock, Maximize2, Plus, RotateCcw, ShieldAlert, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdkAgent, AdkProject, AdkTool } from "@/contracts/adk";
import {
  AGENT_HEX,
  AGENT_META,
  AUTH_META,
  TOOL_HEX,
  TRIGGER_META,
  ToolIcon,
  firstSentence,
  humanize,
  toolSimpleLabel,
  type AdkSelection,
} from "./adk-meta";

export type FlowView = "simple" | "technical";

const AGENT_W = 248;
const AGENT_H = 82;
const TOOL_W = 198;
const TOOL_H = 44;
const H_GAP = 36;
const TOOL_GAP = 14;
const ROW_GAP = 58;

type AgentData = {
  agent: AdkAgent;
  root: boolean;
  order?: number;
  view: FlowView;
  selected: boolean;
  interactive: boolean;
};
type ToolData = { tool: AdkTool; view: FlowView; selected: boolean; interactive: boolean };
type AgentNode = Node<AgentData, "agent">;
type ToolNode = Node<ToolData, "tool">;

const handle = "!size-2 !min-h-0 !min-w-0 !border-0 !bg-transparent";

const AgentCard = memo(function AgentCard({ data }: NodeProps<AgentNode>) {
  const { agent, root, order, view, selected, interactive } = data;
  const meta = AGENT_META[agent.type];
  const Icon = meta.icon;
  const skillCount = agent.skills?.length ?? 0;

  return (
    <div
      style={{ width: AGENT_W, height: AGENT_H }}
      className={cn(
        "relative flex items-center gap-2.5 rounded-xl border-2 bg-card px-3 shadow-md transition-[border-color,box-shadow] duration-200",
        interactive && "cursor-pointer hover:shadow-lg",
        selected
          ? "border-primary ring-4 ring-primary/20"
          : root
            ? "border-primary/60"
            : "border-border",
      )}
    >
      <Handle type="target" position={Position.Top} className={handle} isConnectable={false} />
      {order !== undefined && (
        <span className="absolute -top-2.5 -left-2.5 flex size-5 items-center justify-center rounded-full bg-info font-mono text-[10px] font-bold text-background shadow">
          {order}
        </span>
      )}
      <div className="absolute -top-2.5 right-2 flex items-center gap-1">
        {agent.requireConfirmation && (
          <span
            title="Human-in-the-loop approval required before external write"
            className="inline-flex items-center gap-0.5 rounded-full border border-warning/50 bg-warning/15 px-1.5 py-0.5 text-[9px] font-semibold text-warning shadow-xs"
          >
            <ShieldAlert className="size-2.5" /> HITL
          </span>
        )}
        {skillCount > 0 && (
          <span
            title={`Attached skills: ${agent.skills?.join(", ")}`}
            className="inline-flex items-center gap-0.5 rounded-full border border-brand-2/40 bg-brand-2/15 px-1.5 py-0.5 text-[9px] font-semibold text-brand-2 shadow-xs"
          >
            <Sparkles className="size-2.5" /> {skillCount}
          </span>
        )}
        {view === "technical" && agent.outputKey && (
          <span
            title={`Writes session state key: {${agent.outputKey}}`}
            className="rounded-full border border-border bg-muted px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground shadow-xs"
          >
            {`{${agent.outputKey}}`}
          </span>
        )}
      </div>

      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg border", meta.tone)}>
        <Icon className="size-4.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate font-semibold leading-tight",
            view === "technical" ? "font-mono text-[12px]" : "text-[13px]",
          )}
        >
          {view === "technical" ? agent.name : agent.role || humanize(agent.name)}
        </span>
        <span className="mt-0.5 block truncate text-[10.5px] leading-tight text-muted-foreground">
          {root ? (view === "technical" ? "root · " : "Entry · ") : ""}
          {view === "technical"
            ? `${meta.label}${agent.type === "llm" ? ` · ${agent.model}` : agent.type === "loop" ? ` · max ${agent.maxIterations}` : ""}`
            : agent.role
              ? `${meta.simple} · ${humanize(agent.name)}`
              : meta.simple}
        </span>
        <span className="mt-0.5 block truncate text-[10px] leading-tight text-foreground/70">
          {firstSentence(agent.goal || agent.description)}
        </span>
      </span>
      <Handle type="source" position={Position.Bottom} className={handle} isConnectable={false} />
    </div>
  );
});

const ToolCard = memo(function ToolCard({ data }: NodeProps<ToolNode>) {
  const { tool, view, selected, interactive } = data;
  const isEnterprise = tool.kind === "connector" || tool.kind === "mcp" || tool.kind === "vertex_rag";
  const auth = tool.authType && tool.authType !== "none" ? AUTH_META[tool.authType] : null;

  return (
    <div
      style={{ width: TOOL_W, height: TOOL_H }}
      title={tool.description}
      className={cn(
        "relative flex items-center gap-2 rounded-full border-2 border-dashed bg-card px-3 shadow-sm transition-colors",
        interactive && "cursor-pointer",
        selected
          ? "border-success bg-success/10 ring-2 ring-success/25"
          : isEnterprise
            ? "border-info/60 bg-info/[0.04]"
            : tool.kind === "function"
              ? "border-success/50"
              : "border-muted-foreground/40",
      )}
    >
      <Handle type="target" position={Position.Top} className={handle} isConnectable={false} />
      <ToolIcon
        tool={tool}
        className={cn(
          "size-3.5 shrink-0",
          isEnterprise ? "text-info" : tool.kind === "function" ? "text-success" : "text-muted-foreground",
        )}
      />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate leading-tight",
            view === "technical" ? "font-mono text-[10.5px]" : "text-[11px] font-medium",
          )}
        >
          {view === "technical" ? tool.name : humanize(tool.name)}
        </span>
        <span className="flex items-center gap-1 truncate text-[9px] leading-tight text-muted-foreground">
          <span className="truncate">{toolSimpleLabel(tool)}</span>
          {auth && (
            <span className="inline-flex shrink-0 items-center gap-0.5 font-mono text-[8.5px] text-warning">
              <Lock className="size-2" />
              {auth.short}
            </span>
          )}
        </span>
      </span>
    </div>
  );
});

const nodeTypes = { agent: AgentCard, tool: ToolCard };

/** Tidy tree: every agent's slot is as wide as its tool row or its sub-agent subtrees, whichever is wider. */
export function layoutAdk(
  p: AdkProject,
  view: FlowView,
  selected: AdkSelection,
  interactive: boolean,
  showTools = true,
): { nodes: Node[]; edges: Edge[] } {
  const agents = new Map(p.agents.map((a) => [a.name, a]));
  const tools = new Map(p.tools.map((t) => [t.name, t]));
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const shownTools = (a: AdkAgent) => (showTools ? a.tools : []);
  const toolsRow = (a: AdkAgent) =>
    shownTools(a).length ? shownTools(a).length * TOOL_W + (shownTools(a).length - 1) * TOOL_GAP : 0;

  const widths = new Map<string, number>();
  const width = (name: string): number => {
    const a = agents.get(name);
    if (!a) return AGENT_W;
    const kids = a.subAgents.reduce((sum, c, i) => sum + width(c) + (i ? H_GAP : 0), 0);
    const w = Math.max(AGENT_W, toolsRow(a), kids);
    widths.set(name, w);
    return w;
  };
  width(p.rootAgent);

  const place = (name: string, left: number, top: number, order?: number) => {
    const a = agents.get(name);
    if (!a) return;
    const w = widths.get(name) ?? AGENT_W;
    nodes.push({
      id: `agent:${a.name}`,
      type: "agent",
      position: { x: left + (w - AGENT_W) / 2, y: top },
      width: AGENT_W,
      height: AGENT_H,
      data: {
        agent: a,
        root: a.name === p.rootAgent,
        order,
        view,
        selected: selected?.kind === "agent" && selected.name === a.name,
        interactive,
      },
      draggable: interactive,
      selectable: false,
    } satisfies AgentNode);

    let y = top + AGENT_H + ROW_GAP;
    if (shownTools(a).length) {
      let x = left + (w - toolsRow(a)) / 2;
      for (const tn of shownTools(a)) {
        const t = tools.get(tn);
        if (!t) continue;
        const id = `tool:${a.name}:${tn}`;
        nodes.push({
          id,
          type: "tool",
          position: { x, y },
          width: TOOL_W,
          height: TOOL_H,
          data: {
            tool: t,
            view,
            selected: selected?.kind === "tool" && selected.name === tn,
            interactive,
          },
          draggable: interactive,
          selectable: false,
        } satisfies ToolNode);
        edges.push({
          id: `e:${id}`,
          source: `agent:${a.name}`,
          target: id,
          type: "smoothstep",
          label: view === "simple" ? "uses" : t.kind === "connector" ? "connector" : "tool",
          style: { stroke: "var(--success)", strokeWidth: 1.25, strokeDasharray: "4 4", opacity: 0.7 },
          labelStyle: { fontSize: 10, fill: "var(--muted-foreground)" },
          labelBgStyle: { fill: "var(--card)" },
        });
        x += TOOL_W + TOOL_GAP;
      }
      y += TOOL_H + ROW_GAP;
    }

    let x =
      left +
      (w - a.subAgents.reduce((sum, c, i) => sum + (widths.get(c) ?? AGENT_W) + (i ? H_GAP : 0), 0)) / 2;
    a.subAgents.forEach((c, i) => {
      const childAgent = agents.get(c);
      const condLabel = childAgent?.routeCondition?.trim()
        ? `if ${childAgent.routeCondition.trim().slice(0, 22)}`
        : null;
      const label =
        condLabel ??
        (a.type === "sequential"
          ? view === "simple"
            ? `step ${i + 1}`
            : `${i + 1}`
          : a.type === "parallel"
            ? view === "simple"
              ? "parallel"
              : "parallel"
            : a.type === "loop"
              ? view === "simple"
                ? "repeats"
                : "loop"
              : view === "simple"
                ? "routes to"
                : "sub-agent");
      edges.push({
        id: `e:${a.name}:${c}`,
        source: `agent:${a.name}`,
        target: `agent:${c}`,
        type: "smoothstep",
        label,
        animated: a.type === "sequential" || a.type === "loop",
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: AGENT_META[a.type].color,
          width: 16,
          height: 16,
        },
        style: { stroke: AGENT_META[a.type].color, strokeWidth: 2 },
        labelStyle: { fontSize: 10, fill: "var(--muted-foreground)" },
        labelBgStyle: { fill: "var(--card)" },
      });
      place(c, x, y, a.type === "sequential" ? i + 1 : undefined);
      x += (widths.get(c) ?? AGENT_W) + H_GAP;
    });
  };
  place(p.rootAgent, 0, 0);
  return { nodes, edges };
}

export function AdkFlow({
  project,
  selected = null,
  onSelect,
  view: viewProp,
  onViewChange,
  interactive = true,
  showTools = true,
  onQuickAddAgent,
  onOpenStudio,
  className,
}: {
  project: AdkProject;
  selected?: AdkSelection;
  onSelect?: (s: AdkSelection) => void;
  view?: FlowView;
  onViewChange?: (v: FlowView) => void;
  interactive?: boolean;
  /** Hide tool nodes (compact previews stay readable). */
  showTools?: boolean;
  onQuickAddAgent?: (type: AdkAgent["type"]) => void;
  onOpenStudio?: () => void;
  className?: string;
}) {
  const { resolvedTheme } = useTheme();
  const [ownView, setOwnView] = useState<FlowView>("simple");
  const view = viewProp ?? ownView;
  const setView = onViewChange ?? setOwnView;
  const [moved, setMoved] = useState<Record<string, { x: number; y: number }>>({});

  const base = useMemo(
    () => layoutAdk(project, view, selected, interactive, showTools),
    [project, view, selected, interactive, showTools],
  );
  const nodes = useMemo(
    () => base.nodes.map((n) => (moved[n.id] ? { ...n, position: moved[n.id] } : n)),
    [base, moved],
  );

  const onNodesChange = (changes: NodeChange[]) => {
    const next: Record<string, { x: number; y: number }> = {};
    for (const c of changes) if (c.type === "position" && c.position) next[c.id] = c.position;
    if (Object.keys(next).length) setMoved((m) => ({ ...m, ...next }));
  };

  const triggerType = project.trigger?.kind ?? "chat_a2a";
  const TriggerIcon = TRIGGER_META[triggerType].icon;

  return (
    <div className={cn("relative size-full", className)}>
      <ReactFlow
        nodes={nodes}
        edges={base.edges}
        nodeTypes={nodeTypes}
        onNodesChange={interactive ? onNodesChange : undefined}
        onNodeClick={
          interactive && onSelect
            ? (_, n) =>
                onSelect(
                  n.type === "agent"
                    ? { kind: "agent", name: (n.data as AgentData).agent.name }
                    : { kind: "tool", name: (n.data as ToolData).tool.name },
                )
            : undefined
        }
        colorMode={resolvedTheme === "light" ? "light" : "dark"}
        fitView
        fitViewOptions={{ padding: interactive ? 0.15 : 0.06, maxZoom: 1.1 }}
        minZoom={0.2}
        maxZoom={1.75}
        nodesConnectable={false}
        elementsSelectable={false}
        nodesDraggable={interactive}
        panOnDrag={interactive}
        zoomOnScroll={interactive}
        zoomOnPinch={interactive}
        zoomOnDoubleClick={interactive}
        preventScrolling={interactive}
        proOptions={{ hideAttribution: true }}
        className="!bg-transparent"
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} className="opacity-60" />
        {interactive && (
          <>
            <Controls showInteractive={false} className="!overflow-hidden !rounded-lg !border !shadow-sm" />
            <MiniMap
              pannable
              zoomable
              className="!rounded-lg !border !bg-card"
              nodeColor={(n) =>
                n.type === "agent" ? AGENT_HEX[(n.data as AgentData).agent.type] : TOOL_HEX
              }
              maskColor="color-mix(in oklch, var(--background) 70%, transparent)"
            />
            <Panel position="top-left">
              <div className="flex flex-wrap items-center gap-1.5">
                <div className="flex items-center gap-1 rounded-lg border bg-card/90 p-0.5 shadow-sm backdrop-blur">
                  {(["simple", "technical"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setView(v)}
                      aria-pressed={view === v}
                      className={cn(
                        "h-7 rounded-md px-2.5 text-xs font-medium transition-colors",
                        view === v
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {v === "simple" ? "Simple view" : "Technical view"}
                    </button>
                  ))}
                  {Object.keys(moved).length > 0 && (
                    <button
                      type="button"
                      onClick={() => setMoved({})}
                      title="Reset layout"
                      aria-label="Reset layout"
                      className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <RotateCcw className="size-3.5" />
                    </button>
                  )}
                </div>
                <span
                  title={project.trigger?.inputSchemaSummary || `Flow trigger: ${TRIGGER_META[triggerType].label}`}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border bg-card/90 px-2.5 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur"
                >
                  <TriggerIcon className="size-3.5 text-primary" />
                  <span>Trigger: {TRIGGER_META[triggerType].short}</span>
                </span>
              </div>
            </Panel>
            {(onQuickAddAgent || onOpenStudio) && (
              <Panel position="top-right">
                <div className="flex items-center gap-1 rounded-lg border bg-card/90 p-1 shadow-sm backdrop-blur">
                  {onQuickAddAgent && (
                    <>
                      <button
                        type="button"
                        onClick={() => onQuickAddAgent("llm")}
                        className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-foreground hover:bg-muted"
                        title="Add an LLM specialist agent to the flow"
                      >
                        <Plus className="size-3 text-primary" /> Agent
                      </button>
                      <button
                        type="button"
                        onClick={() => onQuickAddAgent("sequential")}
                        className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-foreground hover:bg-muted"
                        title="Add a Sequential / Parallel / Loop workflow stage"
                      >
                        <Plus className="size-3 text-info" /> Flow stage
                      </button>
                    </>
                  )}
                  {onOpenStudio && (
                    <button
                      type="button"
                      onClick={onOpenStudio}
                      className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                    >
                      <Maximize2 className="size-3" /> Full Studio
                    </button>
                  )}
                </div>
              </Panel>
            )}
          </>
        )}
      </ReactFlow>
    </div>
  );
}
