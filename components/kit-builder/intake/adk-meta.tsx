/** Shared display metadata for ADK agents and tools: icons, colours and plain-language labels. */

import { Bot, Columns3, Database, Flag, Globe, ListOrdered, MousePointerClick, Paperclip, Repeat, SquareFunction } from "lucide-react";
import type { AdkAgent, AdkTool } from "@/contracts/adk";

export type AdkSelection = { kind: "agent" | "tool"; name: string } | null;

/** Concrete colours for SVG attributes (the minimap), where CSS variables don't resolve. */
export const AGENT_HEX: Record<AdkAgent["type"], string> = { llm: "#14b8a6", sequential: "#3b82f6", parallel: "#8b5cf6", loop: "#f59e0b" };
export const TOOL_HEX = "#10b981";

export const AGENT_META: Record<AdkAgent["type"], { label: string; simple: string; icon: typeof Bot; tone: string; color: string }> = {
  llm: { label: "LLM agent", simple: "AI assistant", icon: Bot, tone: "border-primary/50 bg-primary/[0.08] text-primary", color: "var(--primary)" },
  sequential: { label: "Sequential", simple: "Step-by-step workflow", icon: ListOrdered, tone: "border-info/50 bg-info/[0.08] text-info", color: "var(--info)" },
  parallel: { label: "Parallel", simple: "Runs tasks side by side", icon: Columns3, tone: "border-brand-2/50 bg-brand-2/[0.08] text-brand-2", color: "var(--brand-2)" },
  loop: { label: "Loop", simple: "Repeats until done", icon: Repeat, tone: "border-warning/50 bg-warning/[0.08] text-warning", color: "var(--warning)" },
};

const TOOL_KIND = {
  function: { icon: SquareFunction, simple: "Action" },
  web: { icon: Globe, simple: "Web search" },
  url: { icon: Globe, simple: "Reads web pages" },
  memory: { icon: Database, simple: "Memory" },
  files: { icon: Paperclip, simple: "Files" },
  choice: { icon: MousePointerClick, simple: "Asks you" },
  exit: { icon: Flag, simple: "Marks it done" },
} as const;

function toolKind(t: AdkTool): keyof typeof TOOL_KIND {
  if (t.kind === "function") return "function";
  if (t.name === "google_search") return "web";
  if (t.name === "url_context") return "url";
  if (t.name.includes("memory")) return "memory";
  if (t.name === "load_artifacts") return "files";
  if (t.name === "get_user_choice") return "choice";
  return "exit";
}

export function ToolIcon({ tool, className }: { tool: AdkTool; className?: string }) {
  const Icon = TOOL_KIND[toolKind(tool)].icon;
  return <Icon className={className} />;
}

export const toolSimpleLabel = (t: AdkTool) => TOOL_KIND[toolKind(t)].simple;

/** "invoice_coordinator" → "Invoice coordinator". */
export const humanize = (name: string) => {
  const s = name.replace(/_/g, " ").replace(/\s+agent$/, "").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** First sentence, for compact node subtitles. */
export const firstSentence = (s: string) => (s.split(/(?<=[.!?])\s/)[0] ?? s).replace(/\.$/, "");
