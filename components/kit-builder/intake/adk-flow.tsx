"use client";

/**
 * Interactive canvas of a Google ADK agent system, adopted from
 * bleachAgentBuilder's React Flow graph: pan, zoom, drag nodes, minimap and
 * controls. Unlike bleach's fixed grid, nodes get a tidy tree layout (each
 * agent above its tools, sub-agents below), and a Simple view relabels
 * everything in plain language for non-developers.
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
import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdkAgent, AdkProject, AdkTool } from "@/contracts/adk";
import { AGENT_HEX, AGENT_META, TOOL_HEX, ToolIcon, firstSentence, humanize, toolSimpleLabel, type AdkSelection } from "./adk-meta";

export type FlowView = "simple" | "technical";

const AGENT_W = 236;
const AGENT_H = 72;
const TOOL_W = 184;
const TOOL_H = 40;
const H_GAP = 36;
const TOOL_GAP = 14;
const ROW_GAP = 56;

type AgentData = { agent: AdkAgent; root: boolean; order?: number; view: FlowView; selected: boolean; interactive: boolean };
type ToolData = { tool: AdkTool; view: FlowView; selected: boolean; interactive: boolean };
type AgentNode = Node<AgentData, "agent">;
type ToolNode = Node<ToolData, "tool">;

const handle = "!size-2 !min-h-0 !min-w-0 !border-0 !bg-transparent";

const AgentCard = memo(function AgentCard({ data }: NodeProps<AgentNode>) {
  const { agent, root, order, view, selected, interactive } = data;
  const meta = AGENT_META[agent.type];
  const Icon = meta.icon;
  return (
    <div
      style={{ width: AGENT_W, height: AGENT_H }}
      className={cn(
        "relative flex items-center gap-2.5 rounded-xl border-2 bg-card px-3 shadow-md transition-[border-color,box-shadow] duration-200",
        interactive && "cursor-pointer hover:shadow-lg",
        selected ? "border-primary ring-4 ring-primary/20" : root ? "border-primary/60" : "border-border",
      )}
    >
      <Handle type="target" position={Position.Top} className={handle} isConnectable={false} />
      {order !== undefined && (
        <span className="absolute -top-2.5 -left-2.5 flex size-5 items-center justify-center rounded-full bg-info font-mono text-[10px] font-bold text-background shadow">
          {order}
        </span>
      )}
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg border", meta.tone)}>
        <Icon className="size-4.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate font-semibold leading-tight", view === "technical" ? "font-mono text-[12px]" : "text-[13px]")}>
          {view === "technical" ? agent.name : humanize(agent.name)}
        </span>
        <span className="mt-0.5 block truncate text-[10.5px] leading-tight text-muted-foreground">
          {root ? (view === "technical" ? "root · " : "Starts here · ") : ""}
          {view === "technical"
            ? `${meta.label}${agent.type === "llm" ? ` · ${agent.model}` : agent.type === "loop" ? ` · max ${agent.maxIterations}` : ""}`
            : meta.simple}
        </span>
        {view === "simple" && <span className="mt-0.5 block truncate text-[10.5px] leading-tight text-foreground/70">{firstSentence(agent.description)}</span>}
      </span>
      <Handle type="source" position={Position.Bottom} className={handle} isConnectable={false} />
    </div>
  );
});

const ToolCard = memo(function ToolCard({ data }: NodeProps<ToolNode>) {
  const { tool, view, selected, interactive } = data;
  return (
    <div
      style={{ width: TOOL_W, height: TOOL_H }}
      title={tool.description}
      className={cn(
        "flex items-center gap-2 rounded-full border-2 border-dashed bg-card px-3 shadow-sm transition-colors",
        interactive && "cursor-pointer",
        selected ? "border-success bg-success/10 ring-2 ring-success/25" : tool.kind === "function" ? "border-success/50" : "border-muted-foreground/40",
      )}
    >
      <Handle type="target" position={Position.Top} className={handle} isConnectable={false} />
      <ToolIcon tool={tool} className={cn("size-3.5 shrink-0", tool.kind === "function" ? "text-success" : "text-muted-foreground")} />
      <span className="min-w-0">
        <span className={cn("block truncate leading-tight", view === "technical" ? "font-mono text-[11px]" : "text-[11.5px] font-medium")}>
          {view === "technical" ? tool.name : humanize(tool.name)}
        </span>
        {view === "simple" && <span className="block truncate text-[9.5px] leading-tight text-muted-foreground">{toolSimpleLabel(tool)}</span>}
      </span>
    </div>
  );
});

const nodeTypes = { agent: AgentCard, tool: ToolCard };

/** Tidy tree: every agent's slot is as wide as its tool row or its sub-agent subtrees, whichever is wider. */
export function layoutAdk(p: AdkProject, view: FlowView, selected: AdkSelection, interactive: boolean, showTools = true): { nodes: Node[]; edges: Edge[] } {
  const agents = new Map(p.agents.map((a) => [a.name, a]));
  const tools = new Map(p.tools.map((t) => [t.name, t]));
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const shownTools = (a: AdkAgent) => (showTools ? a.tools : []);
  const toolsRow = (a: AdkAgent) => (shownTools(a).length ? shownTools(a).length * TOOL_W + (shownTools(a).length - 1) * TOOL_GAP : 0);

  const widths = new Map<string, number>();
  const width = (name: string): number => {
    const a = agents.get(name)!;
    const kids = a.subAgents.reduce((sum, c, i) => sum + width(c) + (i ? H_GAP : 0), 0);
    const w = Math.max(AGENT_W, toolsRow(a), kids);
    widths.set(name, w);
    return w;
  };
  width(p.rootAgent);

  const place = (name: string, left: number, top: number, order?: number) => {
    const a = agents.get(name)!;
    const w = widths.get(name)!;
    nodes.push({
      id: `agent:${a.name}`,
      type: "agent",
      position: { x: left + (w - AGENT_W) / 2, y: top },
      width: AGENT_W,
      height: AGENT_H,
      data: { agent: a, root: a.name === p.rootAgent, order, view, selected: selected?.kind === "agent" && selected.name === a.name, interactive },
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
          data: { tool: t, view, selected: selected?.kind === "tool" && selected.name === tn, interactive },
          draggable: interactive,
          selectable: false,
        } satisfies ToolNode);
        edges.push({
          id: `e:${id}`,
          source: `agent:${a.name}`,
          target: id,
          type: "smoothstep",
          label: view === "simple" ? "can use" : "uses",
          style: { stroke: "var(--success)", strokeWidth: 1.25, strokeDasharray: "4 4", opacity: 0.7 },
          labelStyle: { fontSize: 10, fill: "var(--muted-foreground)" },
          labelBgStyle: { fill: "var(--card)" },
        });
        x += TOOL_W + TOOL_GAP;
      }
      y += TOOL_H + ROW_GAP;
    }

    let x = left + (w - a.subAgents.reduce((sum, c, i) => sum + widths.get(c)! + (i ? H_GAP : 0), 0)) / 2;
    a.subAgents.forEach((c, i) => {
      const label =
        a.type === "sequential"
          ? view === "simple" ? `step ${i + 1}` : `${i + 1}`
          : a.type === "parallel"
            ? view === "simple" ? "at the same time" : "parallel"
            : a.type === "loop"
              ? view === "simple" ? "repeats" : "loop"
              : view === "simple" ? "hands off to" : "sub-agent";
      edges.push({
        id: `e:${a.name}:${c}`,
        source: `agent:${a.name}`,
        target: `agent:${c}`,
        type: "smoothstep",
        label,
        animated: a.type === "sequential" || a.type === "loop",
        markerEnd: { type: MarkerType.ArrowClosed, color: AGENT_META[a.type].color, width: 16, height: 16 },
        style: { stroke: AGENT_META[a.type].color, strokeWidth: 2 },
        labelStyle: { fontSize: 10, fill: "var(--muted-foreground)" },
        labelBgStyle: { fill: "var(--card)" },
      });
      place(c, x, y, a.type === "sequential" ? i + 1 : undefined);
      x += widths.get(c)! + H_GAP;
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
  className?: string;
}) {
  const { resolvedTheme } = useTheme();
  const [ownView, setOwnView] = useState<FlowView>("simple");
  const view = viewProp ?? ownView;
  const setView = onViewChange ?? setOwnView;
  const [moved, setMoved] = useState<Record<string, { x: number; y: number }>>({});

  const base = useMemo(() => layoutAdk(project, view, selected, interactive, showTools), [project, view, selected, interactive, showTools]);
  const nodes = useMemo(() => base.nodes.map((n) => (moved[n.id] ? { ...n, position: moved[n.id] } : n)), [base, moved]);

  const onNodesChange = (changes: NodeChange[]) => {
    const next: Record<string, { x: number; y: number }> = {};
    for (const c of changes) if (c.type === "position" && c.position) next[c.id] = c.position;
    if (Object.keys(next).length) setMoved((m) => ({ ...m, ...next }));
  };

  return (
    <div className={cn("relative size-full", className)}>
      <ReactFlow
        nodes={nodes}
        edges={base.edges}
        nodeTypes={nodeTypes}
        onNodesChange={interactive ? onNodesChange : undefined}
        onNodeClick={
          interactive && onSelect
            ? (_, n) => onSelect(n.type === "agent" ? { kind: "agent", name: (n.data as AgentData).agent.name } : { kind: "tool", name: (n.data as ToolData).tool.name })
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
              nodeColor={(n) => (n.type === "agent" ? AGENT_HEX[(n.data as AgentData).agent.type] : TOOL_HEX)}
              maskColor="color-mix(in oklch, var(--background) 70%, transparent)"
            />
            <Panel position="top-left">
              <div className="flex items-center gap-1 rounded-lg border bg-card/90 p-0.5 shadow-sm backdrop-blur">
                {(["simple", "technical"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setView(v)}
                    aria-pressed={view === v}
                    className={cn(
                      "h-7 rounded-md px-2.5 text-xs font-medium transition-colors",
                      view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
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
            </Panel>
          </>
        )}
      </ReactFlow>
    </div>
  );
}
