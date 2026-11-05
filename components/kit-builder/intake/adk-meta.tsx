/** Shared display metadata for ADK agents, tools, triggers, and auth modes: icons, colours and plain-language labels. */

import {
  BookOpen,
  Bot,
  Clock,
  Columns3,
  Database,
  Flag,
  Globe,
  ListOrdered,
  MessageSquare,
  MousePointerClick,
  Paperclip,
  Plug,
  Radio,
  Repeat,
  Server,
  SquareFunction,
  Webhook,
  Zap,
} from "lucide-react";
import type { AdkAgent, AdkAuthType, AdkTool, AdkTriggerType } from "@/contracts/adk";

export type AdkSelection = { kind: "agent" | "tool"; name: string } | null;

/** Concrete colours for SVG attributes (the minimap), where CSS variables don't resolve. */
export const AGENT_HEX: Record<AdkAgent["type"], string> = {
  llm: "#14b8a6",
  sequential: "#3b82f6",
  parallel: "#8b5cf6",
  loop: "#f59e0b",
};
export const TOOL_HEX = "#10b981";

export const AGENT_META: Record<
  AdkAgent["type"],
  { label: string; simple: string; icon: typeof Bot; tone: string; color: string }
> = {
  llm: {
    label: "LLM agent",
    simple: "AI specialist",
    icon: Bot,
    tone: "border-primary/50 bg-primary/[0.08] text-primary",
    color: "var(--primary)",
  },
  sequential: {
    label: "Sequential",
    simple: "Step-by-step workflow",
    icon: ListOrdered,
    tone: "border-info/50 bg-info/[0.08] text-info",
    color: "var(--info)",
  },
  parallel: {
    label: "Parallel",
    simple: "Runs tasks side by side",
    icon: Columns3,
    tone: "border-brand-2/50 bg-brand-2/[0.08] text-brand-2",
    color: "var(--brand-2)",
  },
  loop: {
    label: "Loop",
    simple: "Repeats until done",
    icon: Repeat,
    tone: "border-warning/50 bg-warning/[0.08] text-warning",
    color: "var(--warning)",
  },
};

export const TRIGGER_META: Record<
  AdkTriggerType,
  { label: string; short: string; icon: typeof MessageSquare }
> = {
  chat_a2a: { label: "Interactive Chat / A2A", short: "Chat / A2A", icon: MessageSquare },
  pubsub: { label: "Cloud Pub/Sub Topic", short: "Pub/Sub", icon: Radio },
  eventarc: { label: "Google Eventarc Trigger", short: "Eventarc", icon: Zap },
  schedule: { label: "Cloud Scheduler (Cron)", short: "Schedule", icon: Clock },
  webhook: { label: "Webhook / System Event", short: "Webhook", icon: Webhook },
};

export const AUTH_META: Record<
  AdkAuthType,
  { label: string; short: string; badgeClass: string }
> = {
  none: { label: "No External Auth", short: "Local", badgeClass: "border-border text-muted-foreground" },
  adc_wif: {
    label: "Workload Identity / ADC (Keyless)",
    short: "WIF / IAM",
    badgeClass: "border-info/40 bg-info/10 text-info",
  },
  secret_manager: {
    label: "GCP Secret Manager (--secrets)",
    short: "Secret Mgr",
    badgeClass: "border-warning/40 bg-warning/10 text-warning",
  },
  oauth_user_consent: {
    label: "Gemini Enterprise OAuth 2.0 Consent",
    short: "OAuth 2.0",
    badgeClass: "border-primary/40 bg-primary/10 text-primary",
  },
  service_account: {
    label: "Runtime Service Account IAM",
    short: "Runtime SA",
    badgeClass: "border-brand-2/40 bg-brand-2/10 text-brand-2",
  },
};

const TOOL_KIND = {
  connector: { icon: Plug, simple: "Enterprise connector" },
  mcp: { icon: Server, simple: "MCP toolset" },
  vertex_rag: { icon: BookOpen, simple: "Vertex AI Search RAG" },
  function: { icon: SquareFunction, simple: "Python tool" },
  web: { icon: Globe, simple: "Web search" },
  url: { icon: Globe, simple: "Reads web pages" },
  memory: { icon: Database, simple: "Memory" },
  files: { icon: Paperclip, simple: "Files" },
  choice: { icon: MousePointerClick, simple: "Asks user" },
  exit: { icon: Flag, simple: "Exits loop" },
} as const;

function toolKind(t: AdkTool): keyof typeof TOOL_KIND {
  if (t.kind === "connector") return "connector";
  if (t.kind === "mcp") return "mcp";
  if (t.kind === "vertex_rag") return "vertex_rag";
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

export const toolSimpleLabel = (t: AdkTool) =>
  t.connectorSystem
    ? `${t.connectorSystem} connector`
    : t.mcpServer
      ? `MCP · ${t.mcpServer}`
      : TOOL_KIND[toolKind(t)].simple;

/** "invoice_coordinator" → "Invoice coordinator". */
export const humanize = (name: string) => {
  const s = name.replace(/_/g, " ").replace(/\s+agent$/, "").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** First sentence, for compact node subtitles. */
export const firstSentence = (s: string) =>
  (s.split(/(?<=[.!?])\s/)[0] ?? s).replace(/\.$/, "");
