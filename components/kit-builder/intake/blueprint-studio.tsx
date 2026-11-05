"use client";

/**
 * Full-screen Google ADK & Vertex AI Studio, inspired by CrewAI Studio v2
 * (app.crewai.com/studio/v2) and CrewAI Connections (app.crewai.com/crewai_plus/connections):
 *   1. Flow Canvas     — Visual flow graph, event triggers, CrewAI-style Persona/Task inspector
 *   2. Tools & Skills  — Enterprise Connectors (SAP, ServiceNow, Salesforce, SharePoint, Jira, BigQuery, Workday, Vertex AI RAG), Built-in tools, MCP servers, and SKILL.md skills
 *   3. Connections     — Zero-secret-in-browser Connections & Env Var Hub (ADC/WIF, GCP Secret Manager --secrets, Gemini OAuth 2.0 User Consent)
 *   4. Test & Eval     — Interactive ADK Flow Simulator + agents-cli eval dataset builder
 *   5. Code            — Live multi-file Python ADK 2.13 + eval + manifest viewer
 *   6. Deploy & CLI    — Flexible Google Cloud deployment (Agent Runtime, Cloud Run, GKE, Gemini Enterprise + Agent Registry + Agent Gateway)
 */

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Bot,
  CheckCircle2,
  Code2,
  Copy,
  Download,
  FlaskConical,
  KeyRound,
  Layers,
  Lock,
  Network,
  Play,
  Plug,
  PlugZap,
  Plus,
  RefreshCw,
  Rocket,
  Server,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  SquareFunction,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";
import {
  ADK_AUTH_TYPES,
  ADK_BUILTIN_TOOLS,
  ADK_TRIGGER_TYPES,
  type AdkAgent,
  type AdkAuthType,
  type AdkEvalCase,
  type AdkEnvVar,
  type AdkProject,
  type AdkTool,
  type AdkTriggerType,
} from "@/contracts/adk";
import type { Brief } from "@/contracts/intake";
import {
  ENTERPRISE_TOOL_PRESETS,
  buildMcpAdkTool,
  composeInstructionFromPersona,
  syncEnvVarsFromProjectAndBrief,
} from "@/lib/adk/catalog";
import { generateAdkProject } from "@/lib/adk/generate";
import { ADK_MODELS } from "@/lib/adk/models";
import { DEFAULT_ADK_MODEL } from "@/lib/adk/normalize";
import { GCP_REGIONS } from "@/lib/config/public";
import { createZip } from "@/lib/kit/zip";
import {
  AGENT_META,
  AUTH_META,
  TRIGGER_META,
  ToolIcon,
  humanize,
  type AdkSelection,
} from "./adk-meta";
import { AdkFlow } from "./adk-flow";

export type BlueprintStudioPane =
  | "graph"
  | "tools"
  | "connections"
  | "eval"
  | "code"
  | "deploy";

const CURATED_ADK_SKILLS = [
  {
    slug: "owasp-security-review-skill",
    title: "OWASP Security Review",
    description: "Validates inputs, tool arguments, and outputs against OWASP Top 10 & ASVS.",
  },
  {
    slug: "secure-coding-guardrails-skill",
    title: "Secure Coding Guardrails",
    description: "Enforces least privilege, parameterized queries, and zero hardcoded secrets.",
  },
  {
    slug: "pr-governance-gate-skill",
    title: "PR & Change Governance Gate",
    description: "Checks change provenance, audit readiness, and human approval requirements.",
  },
  {
    slug: "threat-model-stride",
    title: "STRIDE Threat Modeling",
    description: "Evaluates spoofing, tampering, and elevation of privilege across agent boundaries.",
  },
] as const;

export function downloadAdk(project: AdkProject) {
  const blob = createZip(
    generateAdkProject(project).map((f) => ({
      path: `${project.packageName}/${f.path}`,
      contents: f.contents,
    })),
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${project.packageName}-adk.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

export function BlueprintStudio({
  project,
  brief,
  open,
  onOpenChange,
  onChange,
  initialPane = "graph",
}: {
  project: AdkProject;
  brief?: Brief;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onChange: (change: (p: AdkProject) => AdkProject) => void;
  initialPane?: BlueprintStudioPane;
}) {
  const [pane, setPane] = useState<BlueprintStudioPane>(initialPane);
  const [selected, setSelected] = useState<AdkSelection>({
    kind: "agent",
    name: project.rootAgent,
  });
  const files = useMemo(() => generateAdkProject(project), [project]);
  const [file, setFile] = useState(`${project.packageName}/agent.py`);
  const current = files.find((f) => f.path === file) ?? files[0];

  const agent =
    selected?.kind === "agent"
      ? project.agents.find((a) => a.name === selected.name) ??
        project.agents.find((a) => a.name === project.rootAgent)
      : undefined;
  const tool =
    selected?.kind === "tool"
      ? project.tools.find((t) => t.name === selected.name)
      : undefined;

  const patchAgent = (name: string, p: Partial<AdkAgent>) =>
    onChange((proj) => ({
      ...proj,
      agents: proj.agents.map((a) => (a.name === name ? { ...a, ...p } : a)),
    }));

  const patchTool = (name: string, p: Partial<AdkTool>) =>
    onChange((proj) => ({
      ...proj,
      tools: proj.tools.map((t) => (t.name === name ? { ...t, ...p } : t)),
    }));

  const addAgentToFlow = (type: AdkAgent["type"]) => {
    const idx = project.agents.length + 1;
    const baseName =
      type === "llm"
        ? `specialist_${idx}`
        : type === "sequential"
          ? `pipeline_stage_${idx}`
          : type === "parallel"
            ? `parallel_group_${idx}`
            : `validation_loop_${idx}`;
    const newAgent: AdkAgent = {
      name: baseName,
      type,
      role: type === "llm" ? `Domain Specialist ${idx}` : `${humanize(type)} Orchestrator`,
      goal:
        type === "llm"
          ? "Execute a bounded domain task and write structured output to session state."
          : "Coordinate child specialist agents in a deterministic workflow.",
      description:
        type === "llm"
          ? "Handles a specialized domain step within the ADK flow."
          : `Runs sub-agents in a ${type} workflow.`,
      ...(type === "llm"
        ? {
            model: DEFAULT_ADK_MODEL,
            instruction: `You are Domain Specialist ${idx}.\nComplete your assigned task and store the result in session state.`,
            outputKey: `${baseName}_output`,
          }
        : {}),
      ...(type === "loop" ? { maxIterations: 3 } : {}),
      tools: [],
      subAgents: [],
    };
    const parentTarget =
      agent && agent.type !== "llm"
        ? agent.name
        : project.agents.find((a) => a.type === "sequential")?.name ?? project.rootAgent;

    onChange((proj) => ({
      ...proj,
      agents: [
        ...proj.agents.map((a) =>
          a.name === parentTarget && !a.subAgents.includes(baseName)
            ? { ...a, subAgents: [...a.subAgents, baseName] }
            : a,
        ),
        newAgent,
      ],
    }));
    setSelected({ kind: "agent", name: baseName });
  };

  const deleteAgentFromFlow = (name: string) => {
    if (name === project.rootAgent) return;
    onChange((proj) => ({
      ...proj,
      agents: proj.agents
        .filter((a) => a.name !== name)
        .map((a) => ({
          ...a,
          subAgents: a.subAgents.filter((s) => s !== name),
        })),
    }));
    setSelected({ kind: "agent", name: project.rootAgent });
  };

  const counts = {
    llm: project.agents.filter((a) => a.type === "llm").length,
    workflow: project.agents.filter((a) => a.type !== "llm").length,
    tools: project.tools.length,
    env: project.envVars.length,
  };

  const tabs: readonly [BlueprintStudioPane, typeof Network, string, string?][] = [
    ["graph", Network, "Flow Canvas", `${project.agents.length}`],
    ["tools", Plug, "Tools, MCP & Skills", `${counts.tools}`],
    ["connections", PlugZap, "Connections & Env", `${counts.env}`],
    ["eval", FlaskConical, "Test & Eval", `${project.evalCases?.length ?? 1}`],
    ["code", Code2, "Code", `${files.length}`],
    ["deploy", Rocket, "Deploy & CLI"],
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[94dvh] max-w-[97vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[97vw]"
      >
        {/* Header */}
        <header className="flex flex-wrap items-center gap-3 border-b bg-gradient-to-r from-primary/10 via-transparent to-transparent px-5 py-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand-2 text-primary-foreground shadow-md shadow-primary/25">
            <Network className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-base font-semibold">
              {project.title}
            </DialogTitle>
            <p className="truncate text-xs text-muted-foreground">
              Google ADK & Vertex AI Studio · <span className="font-mono">{project.packageName}</span> ·{" "}
              {counts.llm} LLM + {counts.workflow} flow agents · {counts.tools} tools · {counts.env} connections/env
            </p>
          </div>
          <div role="tablist" className="flex flex-wrap rounded-lg border bg-background/70 p-0.5">
            {tabs.map(([id, Icon, tabLabel, badge]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={pane === id}
                onClick={() => setPane(id)}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-medium transition-colors",
                  pane === id
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" />
                <span>{tabLabel}</span>
                {badge && (
                  <span
                    className={cn(
                      "rounded px-1 font-mono text-[10px]",
                      pane === id ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted",
                    )}
                  >
                    {badge}
                  </span>
                )}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={() => downloadAdk(project)}>
            <Download className="size-3.5" /> Export ADK Zip
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            aria-label="Close studio"
          >
            <X className="size-4" />
          </Button>
        </header>

        {project.warnings.length > 0 && (
          <details className="border-b bg-warning/5 px-5 py-2 text-xs">
            <summary className="inline-flex cursor-pointer items-center gap-1.5 font-medium text-warning">
              <AlertTriangle className="size-3.5" /> {project.warnings.length} validator note
              {project.warnings.length > 1 ? "s" : ""}: the design was repaired automatically
            </summary>
            <ul className="mt-1.5 ml-5 list-disc space-y-0.5 text-muted-foreground">
              {project.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </details>
        )}

        {/* Body */}
        <div className="min-h-0 flex-1">
          {pane === "graph" && (
            <div className="grid h-full grid-cols-1 lg:grid-cols-[minmax(0,1fr)_28rem]">
              <div className="flex min-h-[28rem] flex-col bg-muted/20">
                {/* Flow Canvas Toolbar (Trigger + Add Nodes) */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-card/80 px-4 py-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-muted-foreground">Flow Trigger:</span>
                    <select
                      aria-label="Flow trigger type"
                      value={project.trigger?.kind ?? "chat_a2a"}
                      onChange={(e) =>
                        onChange((proj) => ({
                          ...proj,
                          trigger: {
                            kind: e.target.value as AdkTriggerType,
                            eventTopic: proj.trigger?.eventTopic ?? "",
                            scheduleCron: proj.trigger?.scheduleCron ?? "",
                            inputSchemaSummary:
                              TRIGGER_META[e.target.value as AdkTriggerType].label,
                          },
                        }))
                      }
                      className="h-7 rounded-md border border-input bg-background px-2 text-xs font-medium"
                    >
                      {ADK_TRIGGER_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {TRIGGER_META[t].label}
                        </option>
                      ))}
                    </select>
                    {(project.trigger?.kind === "pubsub" ||
                      project.trigger?.kind === "eventarc" ||
                      project.trigger?.kind === "webhook") && (
                      <Input
                        value={project.trigger?.eventTopic ?? ""}
                        onChange={(e) =>
                          onChange((proj) => ({
                            ...proj,
                            trigger: {
                              kind: proj.trigger?.kind ?? "pubsub",
                              ...proj.trigger,
                              eventTopic: e.target.value,
                            },
                          }))
                        }
                        placeholder="Topic / Event source (e.g. projects/$PROJECT/topics/events)"
                        className="h-7 w-64 font-mono text-[11px]"
                      />
                    )}
                    {project.trigger?.kind === "schedule" && (
                      <Input
                        value={project.trigger?.scheduleCron ?? "0 8 * * 1-5"}
                        onChange={(e) =>
                          onChange((proj) => ({
                            ...proj,
                            trigger: {
                              kind: "schedule",
                              ...proj.trigger,
                              scheduleCron: e.target.value,
                            },
                          }))
                        }
                        placeholder="Cron (e.g. 0 8 * * 1-5)"
                        className="h-7 w-40 font-mono text-[11px]"
                      />
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => addAgentToFlow("llm")}
                    >
                      <Plus className="size-3 text-primary" /> LLM Agent
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => addAgentToFlow("sequential")}
                    >
                      <Plus className="size-3 text-info" /> Sequential
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => addAgentToFlow("parallel")}
                    >
                      <Plus className="size-3 text-brand-2" /> Parallel
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => addAgentToFlow("loop")}
                    >
                      <Plus className="size-3 text-warning" /> Loop
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 text-xs"
                      onClick={() => setPane("tools")}
                    >
                      <Plug className="size-3" /> + Tools & Skills
                    </Button>
                  </div>
                </div>

                <div className="relative min-h-0 flex-1">
                  <AdkFlow
                    project={project}
                    selected={selected}
                    onSelect={setSelected}
                    onQuickAddAgent={addAgentToFlow}
                  />
                  <Legend />
                </div>
              </div>

              <aside className="min-h-0 overflow-y-auto border-l bg-card/60">
                {agent && (
                  <AgentInspector
                    key={agent.name}
                    agent={agent}
                    project={project}
                    onPatch={(p) => patchAgent(agent.name, p)}
                    onDelete={() => deleteAgentFromFlow(agent.name)}
                    onSelectTool={(n) => setSelected({ kind: "tool", name: n })}
                    onOpenToolsTab={() => setPane("tools")}
                    onChangeProject={onChange}
                  />
                )}
                {tool && (
                  <ToolInspector
                    key={tool.name}
                    tool={tool}
                    project={project}
                    onPatch={(p) => patchTool(tool.name, p)}
                    onChangeProject={onChange}
                  />
                )}
                {!agent && !tool && (
                  <p className="p-6 text-sm text-muted-foreground">
                    Select an agent or tool node in the canvas to configure its CrewAI-style Persona, Task contract, Tools, and Guardrails.
                  </p>
                )}
              </aside>
            </div>
          )}

          {pane === "tools" && (
            <ToolsAndSkillsPane
              project={project}
              brief={brief}
              selectedAgentName={
                selected?.kind === "agent" ? selected.name : project.rootAgent
              }
              onChange={onChange}
              onSelectTool={(name) => {
                setSelected({ kind: "tool", name });
                setPane("graph");
              }}
            />
          )}

          {pane === "connections" && (
            <ConnectionsAndEnvPane
              project={project}
              brief={brief}
              onChange={onChange}
            />
          )}

          {pane === "eval" && (
            <TestAndEvalPane project={project} onChange={onChange} />
          )}

          {pane === "code" && (
            <div className="grid h-full grid-cols-1 md:grid-cols-[16rem_minmax(0,1fr)]">
              <nav
                aria-label="Files"
                className="min-h-0 overflow-y-auto border-r bg-card/60 p-2"
              >
                <p className="px-2 pt-1 pb-2 font-mono text-[11px] text-muted-foreground">
                  {project.packageName}/
                </p>
                {files.map((f) => (
                  <button
                    key={f.path}
                    type="button"
                    onClick={() => setFile(f.path)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-mono text-[12px] transition-colors",
                      current.path === f.path
                        ? "bg-primary/12 text-foreground"
                        : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    <Code2 className="size-3.5 shrink-0" />
                    <span className="truncate">{f.path}</span>
                  </button>
                ))}
              </nav>
              <div className="flex min-h-0 flex-col">
                <div className="flex items-center justify-between border-b px-4 py-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    {current.path}
                  </span>
                  <CopyButton value={current.contents} size="sm" label="Copy" />
                </div>
                <pre className="min-h-0 flex-1 overflow-auto bg-muted/30 p-4 text-[12px] leading-[1.6]">
                  <code>
                    {current.contents.split("\n").map((line, i) => (
                      <span key={i} className="block">
                        <span className="mr-4 inline-block w-8 text-right text-muted-foreground/50 select-none">
                          {i + 1}
                        </span>
                        {line || " "}
                      </span>
                    ))}
                  </code>
                </pre>
              </div>
            </div>
          )}

          {pane === "deploy" && <DeployPane project={project} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Legend() {
  return (
    <div className="pointer-events-none absolute right-3 bottom-3 left-14 flex justify-center">
      <div className="inline-flex flex-wrap gap-3 rounded-lg border bg-card/90 px-3 py-2 text-[11px] text-muted-foreground shadow-sm backdrop-blur">
        {Object.entries(AGENT_META).map(([k, m]) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span
              className={cn(
                "flex size-4 items-center justify-center rounded border",
                m.tone,
              )}
            >
              <m.icon className="size-2.5" />
            </span>
            {m.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full border border-dashed border-info" /> connector / MCP / RAG
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full border border-dashed border-success" /> function tool
        </span>
      </div>
    </div>
  );
}

const label =
  "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground";

function AgentInspector({
  agent,
  project,
  onPatch,
  onDelete,
  onSelectTool,
  onOpenToolsTab,
  onChangeProject,
}: {
  agent: AdkAgent;
  project: AdkProject;
  onPatch: (p: Partial<AdkAgent>) => void;
  onDelete: () => void;
  onSelectTool: (name: string) => void;
  onOpenToolsTab: () => void;
  onChangeProject: (change: (p: AdkProject) => AdkProject) => void;
}) {
  const meta = AGENT_META[agent.type];
  const parent = project.agents.find((a) => a.subAgents.includes(agent.name));
  const reads = [
    ...(agent.instruction ?? "").matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\??\}/g),
  ].map((m) => m[1]);

  const toggleAgentTool = (toolName: string) => {
    const next = agent.tools.includes(toolName)
      ? agent.tools.filter((t) => t !== toolName)
      : [...agent.tools, toolName];
    onPatch({ tools: next });
  };

  const toggleAgentSkill = (skillSlug: string) => {
    const current = agent.skills ?? [];
    const next = current.includes(skillSlug)
      ? current.filter((s) => s !== skillSlug)
      : [...current, skillSlug];
    onPatch({ skills: next });
  };

  const changeParent = (newParentName: string) => {
    if (agent.name === project.rootAgent || !newParentName) return;
    onChangeProject((proj) => ({
      ...proj,
      agents: proj.agents.map((a) => {
        const without = a.subAgents.filter((s) => s !== agent.name);
        if (a.name === newParentName) {
          return { ...a, subAgents: [...without, agent.name] };
        }
        return { ...a, subAgents: without };
      }),
    }));
  };

  return (
    <div className="space-y-4 p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-xl border-2",
              meta.tone,
            )}
          >
            <meta.icon className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-mono text-sm font-semibold">{agent.name}</p>
            <p className="text-xs text-muted-foreground">
              {meta.label}
              {agent.name === project.rootAgent
                ? " · root entry agent"
                : parent
                  ? ` · child of ${parent.name}`
                  : ""}
            </p>
          </div>
        </div>
        {agent.name !== project.rootAgent && (
          <Button
            size="icon"
            variant="ghost"
            onClick={onDelete}
            title="Remove agent from flow"
            className="size-8 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        )}
      </div>

      {/* Agent Type & Parent Hierarchy */}
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className={label} htmlFor="adk-agent-type">
            ADK Agent Class
          </label>
          <select
            id="adk-agent-type"
            value={agent.type}
            onChange={(e) => {
              const nextType = e.target.value as AdkAgent["type"];
              onPatch({
                type: nextType,
                ...(nextType === "llm"
                  ? {
                      model: agent.model || DEFAULT_ADK_MODEL,
                      instruction:
                        agent.instruction ||
                        `You are ${agent.role || humanize(agent.name)}. Complete your assigned task.`,
                    }
                  : { tools: [] }),
                ...(nextType === "loop" ? { maxIterations: agent.maxIterations ?? 3 } : {}),
              });
            }}
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs font-medium"
          >
            <option value="llm">LlmAgent (AI Specialist)</option>
            <option value="sequential">SequentialAgent (Pipeline)</option>
            <option value="parallel">ParallelAgent (Concurrent)</option>
            <option value="loop">LoopAgent (Validator Loop)</option>
          </select>
        </div>

        {agent.name !== project.rootAgent && (
          <div>
            <label className={label} htmlFor="adk-parent">
              Parent Orchestrator
            </label>
            <select
              id="adk-parent"
              value={parent?.name ?? project.rootAgent}
              onChange={(e) => changeParent(e.target.value)}
              className="h-8 w-full rounded-md border border-input bg-background px-2 font-mono text-xs"
            >
              {project.agents
                .filter((a) => a.name !== agent.name)
                .map((a) => (
                  <option key={a.name} value={a.name}>
                    {a.name} ({a.type})
                  </option>
                ))}
            </select>
          </div>
        )}
      </div>

      <div>
        <label className={label} htmlFor="adk-desc">
          Routing Description{" "}
          <span className="font-normal normal-case tracking-normal">
            (tells parent agent when to delegate here)
          </span>
        </label>
        <Textarea
          id="adk-desc"
          value={agent.description}
          onChange={(e) => onPatch({ description: e.target.value })}
          className="min-h-14 text-xs"
        />
      </div>

      {/* CrewAI-style Persona Builder (Role / Goal / Backstory) */}
      <div className="space-y-2.5 rounded-xl border bg-muted/20 p-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
            Persona Builder (Role · Goal · Backstory)
          </span>
          {agent.type === "llm" && (
            <button
              type="button"
              onClick={() =>
                onPatch({
                  instruction: composeInstructionFromPersona({
                    ...agent,
                    role: agent.role || humanize(agent.name),
                    goal: agent.goal || agent.description,
                  }),
                })
              }
              className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[10.5px] font-medium text-primary hover:bg-primary/20"
              title="Compile Role, Goal, Backstory, Expected Output, and Skills into the ADK system instruction"
            >
              <Wand2 className="size-3" /> Compose Instruction
            </button>
          )}
        </div>
        <div>
          <label className={label} htmlFor="adk-role">
            Role Title
          </label>
          <Input
            id="adk-role"
            value={agent.role ?? ""}
            onChange={(e) => onPatch({ role: e.target.value || undefined })}
            placeholder="e.g. Senior SAP Invoice Reconciliation Specialist"
            className="h-8 text-xs"
          />
        </div>
        <div>
          <label className={label} htmlFor="adk-goal">
            Primary Goal
          </label>
          <Input
            id="adk-goal"
            value={agent.goal ?? ""}
            onChange={(e) => onPatch({ goal: e.target.value || undefined })}
            placeholder="e.g. Match supplier invoices against POs with zero discrepancy"
            className="h-8 text-xs"
          />
        </div>
        {agent.type === "llm" && (
          <div>
            <label className={label} htmlFor="adk-backstory">
              Backstory & Operating Context
            </label>
            <Textarea
              id="adk-backstory"
              value={agent.backstory ?? ""}
              onChange={(e) => onPatch({ backstory: e.target.value || undefined })}
              placeholder="Domain expertise, enterprise policies, and tone..."
              className="min-h-14 text-xs"
            />
          </div>
        )}
      </div>

      {/* Conditional Route & Governance Gate */}
      <div className="space-y-2.5 rounded-xl border bg-muted/20 p-3">
        <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Flow Routing & Governance Gate
        </span>
        <div>
          <label className={label} htmlFor="adk-route-cond">
            Conditional Route Expression{" "}
            <span className="font-normal normal-case">(optional edge condition)</span>
          </label>
          <Input
            id="adk-route-cond"
            value={agent.routeCondition ?? ""}
            onChange={(e) => onPatch({ routeCondition: e.target.value || undefined })}
            placeholder='e.g. state.risk_tier == "high" or state.amount > 5000'
            className="h-8 font-mono text-xs"
          />
        </div>
        <label className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border bg-background/70 px-3 py-2 text-xs">
          <span className="flex items-center gap-2 font-medium">
            <ShieldAlert className="size-4 text-warning" />
            Require Human Approval (HITL) before write actions
          </span>
          <input
            type="checkbox"
            checked={Boolean(agent.requireConfirmation)}
            onChange={(e) => onPatch({ requireConfirmation: e.target.checked })}
            className="size-4 accent-primary"
          />
        </label>
      </div>

      {agent.type === "llm" ? (
        <>
          <div>
            <label className={label} htmlFor="adk-model">
              Vertex AI Gemini Model
            </label>
            <select
              id="adk-model"
              value={agent.model}
              onChange={(e) => onPatch({ model: e.target.value })}
              className="h-9 w-full rounded-md border border-input bg-background px-2.5 font-mono text-xs"
            >
              {!ADK_MODELS.some((m) => m.id === agent.model) && (
                <option value={agent.model}>{agent.model}</option>
              )}
              {ADK_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id} · {m.note}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="adk-instr">
              ADK System Instruction{" "}
              <span className="font-normal normal-case">
                (supports {"{state_var?}"} interpolation)
              </span>
            </label>
            <Textarea
              id="adk-instr"
              value={agent.instruction ?? ""}
              onChange={(e) => onPatch({ instruction: e.target.value })}
              className="min-h-40 font-mono text-xs leading-5"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label} htmlFor="adk-out">
                Writes state (output_key)
              </label>
              <Input
                id="adk-out"
                value={agent.outputKey ?? ""}
                onChange={(e) =>
                  onPatch({
                    outputKey: e.target.value.replace(/[^a-z0-9_]/g, "") || undefined,
                  })
                }
                placeholder="output_key"
                className="h-8 font-mono text-xs"
              />
            </div>
            <div>
              <p className={label}>Reads state</p>
              <p className="pt-1.5 font-mono text-xs text-muted-foreground">
                {reads.length ? reads.map((r) => `{${r}}`).join(" ") : "none"}
              </p>
            </div>
          </div>
          <div>
            <label className={label} htmlFor="adk-expected-out">
              Expected Output Contract
            </label>
            <Input
              id="adk-expected-out"
              value={agent.expectedOutput ?? ""}
              onChange={(e) => onPatch({ expectedOutput: e.target.value || undefined })}
              placeholder="e.g. JSON object with status, matched_records, and citation_links"
              className="h-8 text-xs"
            />
          </div>

          {/* Tools attached to this agent */}
          <div className="space-y-2 rounded-xl border bg-muted/20 p-3">
            <div className="flex items-center justify-between">
              <p className={cn(label, "mb-0")}>Attached Tools & Connectors</p>
              <button
                type="button"
                onClick={onOpenToolsTab}
                className="text-[11px] font-medium text-primary hover:underline"
              >
                + Browse Marketplace
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {project.tools.map((t) => {
                const active = agent.tools.includes(t.name);
                return (
                  <button
                    key={t.name}
                    type="button"
                    onClick={() => toggleAgentTool(t.name)}
                    onDoubleClick={() => onSelectTool(t.name)}
                    title={
                      active
                        ? `Click to detach ${t.name} (double-click to inspect tool)`
                        : `Click to attach ${t.name} to ${agent.name}`
                    }
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors",
                      active
                        ? "border-success bg-success/15 text-foreground"
                        : "border-dashed border-border text-muted-foreground hover:border-primary/40",
                    )}
                  >
                    <ToolIcon tool={t} className="size-3" />
                    {t.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Skills attached to this agent */}
          <div className="space-y-2 rounded-xl border bg-muted/20 p-3">
            <p className={cn(label, "mb-0")}>Attached Domain Skills (SKILL.md)</p>
            <div className="flex flex-wrap gap-1.5">
              {CURATED_ADK_SKILLS.map((sk) => {
                const active = (agent.skills ?? []).includes(sk.slug);
                return (
                  <button
                    key={sk.slug}
                    type="button"
                    onClick={() => toggleAgentSkill(sk.slug)}
                    title={sk.description}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
                      active
                        ? "border-brand-2/60 bg-brand-2/15 text-brand-2"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Sparkles className="size-3" />
                    {sk.title}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-lg border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
          {agent.type === "sequential" &&
            "Runs its sub-agents in strict sequential order, passing results through shared session state ({output_key})."}
          {agent.type === "parallel" &&
            "Runs its sub-agents concurrently in parallel branches; a downstream agent synthesizes their state keys."}
          {agent.type === "loop" && (
            <>
              Repeats its sub-agents until a validator calls <code>exit_loop</code> or the iteration cap is reached.
              <label className={cn(label, "mt-3")} htmlFor="adk-iter">
                Max iterations
              </label>
              <Input
                id="adk-iter"
                type="number"
                min={1}
                max={10}
                value={agent.maxIterations ?? 3}
                onChange={(e) =>
                  onPatch({
                    maxIterations: Math.min(10, Math.max(1, Number(e.target.value) || 1)),
                  })
                }
                className="h-8 w-24 text-sm"
              />
            </>
          )}
          <p className="mt-2">
            Sub-agents ({agent.subAgents.length}):{" "}
            <span className="font-mono">
              {agent.subAgents.join(" → ") || "none yet"}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}

function ToolInspector({
  tool,
  project,
  onPatch,
  onChangeProject,
}: {
  tool: AdkTool;
  project: AdkProject;
  onPatch: (p: Partial<AdkTool>) => void;
  onChangeProject: (change: (p: AdkProject) => AdkProject) => void;
}) {
  const users = project.agents
    .filter((a) => a.tools.includes(tool.name))
    .map((a) => a.name);
  const llmAgents = project.agents.filter((a) => a.type === "llm");

  const toggleUsedBy = (agentName: string) => {
    onChangeProject((proj) => ({
      ...proj,
      agents: proj.agents.map((a) => {
        if (a.name !== agentName) return a;
        const has = a.tools.includes(tool.name);
        return {
          ...a,
          tools: has ? a.tools.filter((t) => t !== tool.name) : [...a.tools, tool.name],
        };
      }),
    }));
  };

  return (
    <div className="space-y-4 p-5">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl border-2 border-dashed border-success/60 text-success">
          <ToolIcon tool={tool} className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-mono text-sm font-semibold">{tool.name}</p>
          <p className="text-xs text-muted-foreground">
            {tool.kind === "builtin"
              ? "ADK built-in tool"
              : tool.kind === "connector"
                ? `Enterprise connector (${tool.connectorSystem || "custom"})`
                : tool.kind === "mcp"
                  ? `MCP toolset (${tool.mcpServer || "stdio"})`
                  : tool.kind === "vertex_rag"
                    ? "Vertex AI Search RAG"
                    : "Python function tool"}{" "}
            · used by {users.join(", ") || "no agent"}
          </p>
        </div>
      </div>

      <div>
        <label className={label} htmlFor="tool-desc">
          Description
        </label>
        <Input
          id="tool-desc"
          value={tool.description}
          onChange={(e) => onPatch({ description: e.target.value })}
          className="h-8 text-xs"
        />
      </div>

      {/* Auth Mode & Human Confirmation */}
      <div className="space-y-2.5 rounded-xl border bg-muted/20 p-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={label} htmlFor="tool-auth">
              Authentication Mode
            </label>
            <select
              id="tool-auth"
              value={tool.authType ?? "none"}
              onChange={(e) => onPatch({ authType: e.target.value as AdkAuthType })}
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
            >
              {ADK_AUTH_TYPES.map((a) => (
                <option key={a} value={a}>
                  {AUTH_META[a].label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="tool-sys">
              Target System / Server
            </label>
            <Input
              id="tool-sys"
              value={tool.connectorSystem ?? tool.mcpServer ?? ""}
              onChange={(e) => onPatch({ connectorSystem: e.target.value || undefined })}
              placeholder="e.g. SAP, ServiceNow, Jira"
              className="h-8 text-xs"
            />
          </div>
        </div>
        <label className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border bg-background/70 px-3 py-2 text-xs">
          <span className="flex items-center gap-1.5 font-medium">
            <ShieldAlert className="size-3.5 text-warning" />
            Require Human Confirmation before executing this tool
          </span>
          <input
            type="checkbox"
            checked={Boolean(tool.requireConfirmation)}
            onChange={(e) => onPatch({ requireConfirmation: e.target.checked })}
            className="size-4 accent-primary"
          />
        </label>
      </div>

      {/* Used by Agents */}
      <div>
        <p className={label}>Assigned to LLM Agents</p>
        <div className="flex flex-wrap gap-1.5">
          {llmAgents.map((a) => {
            const active = a.tools.includes(tool.name);
            return (
              <button
                key={a.name}
                type="button"
                onClick={() => toggleUsedBy(a.name)}
                className={cn(
                  "rounded-md border px-2.5 py-1 font-mono text-[11px] transition-colors",
                  active
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {a.name}
              </button>
            );
          })}
        </div>
      </div>

      {tool.kind !== "builtin" ? (
        <>
          <div>
            <label className={label} htmlFor="adk-code">
              Python Tool Implementation{" "}
              <span className="font-normal normal-case tracking-normal">
                (docstring guides the model)
              </span>
            </label>
            <Textarea
              id="adk-code"
              value={tool.code ?? ""}
              onChange={(e) => onPatch({ code: e.target.value })}
              spellCheck={false}
              className="min-h-72 font-mono text-[11.5px] leading-5"
            />
          </div>
          {(tool.imports.length > 0 ||
            tool.dependencies.length > 0 ||
            (tool.envVars?.length ?? 0) > 0) && (
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <p className={label}>Imports</p>
                <pre className="font-mono text-[10.5px] whitespace-pre-wrap text-muted-foreground">
                  {tool.imports.join("\n") || "none"}
                </pre>
              </div>
              <div>
                <p className={label}>pip packages</p>
                <pre className="font-mono text-[10.5px] whitespace-pre-wrap text-muted-foreground">
                  {tool.dependencies.join("\n") || "none"}
                </pre>
              </div>
              <div>
                <p className={label}>Env / Secrets</p>
                <pre className="font-mono text-[10.5px] whitespace-pre-wrap text-muted-foreground">
                  {(tool.envVars ?? []).join("\n") || "none"}
                </pre>
              </div>
            </div>
          )}
        </>
      ) : (
        <pre className="rounded-lg border bg-muted/30 p-3 font-mono text-xs">
          from google.adk.tools import {tool.name}
        </pre>
      )}
    </div>
  );
}

/** Tab 2: Tools, Enterprise Connectors, MCP Servers, and SKILL.md Marketplace */
function ToolsAndSkillsPane({
  project,
  brief,
  selectedAgentName,
  onChange,
  onSelectTool,
}: {
  project: AdkProject;
  brief?: Brief;
  selectedAgentName: string;
  onChange: (change: (p: AdkProject) => AdkProject) => void;
  onSelectTool: (name: string) => void;
}) {
  const llmAgents = project.agents.filter((a) => a.type === "llm");
  const [targetAgent, setTargetAgent] = useState(
    llmAgents.some((a) => a.name === selectedAgentName)
      ? selectedAgentName
      : llmAgents[0]?.name ?? project.rootAgent,
  );
  const [mcpSlug, setMcpSlug] = useState("");
  const [mcpCommand, setMcpCommand] = useState("npx -y @modelcontextprotocol/server-postgres");
  const [customFnName, setCustomFnName] = useState("");
  const [customFnDesc, setCustomFnDesc] = useState("");

  const currentAgent = project.agents.find((a) => a.name === targetAgent);

  const attachPresetTool = (presetId: string) => {
    const preset = ENTERPRISE_TOOL_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const toolObj: AdkTool = {
      name: preset.name,
      kind: preset.kind,
      description: preset.description,
      builtin: preset.builtin,
      connectorSystem: preset.connectorSystem,
      mcpServer: preset.mcpServer,
      ragDataStoreId: preset.ragDataStoreId,
      authType: preset.authType,
      requireConfirmation: preset.requireConfirmation,
      code: preset.code,
      imports: [...preset.imports],
      dependencies: [...preset.dependencies],
      envVars: preset.envVars.map((e) => e.name),
    };
    onChange((proj) => {
      const hasTool = proj.tools.some((t) => t.name === preset.name);
      const nextTools = hasTool ? proj.tools : [...proj.tools, toolObj];
      const nextAgents = proj.agents.map((a) =>
        a.name === targetAgent && !a.tools.includes(preset.name)
          ? { ...a, tools: [...a.tools, preset.name] }
          : a,
      );
      const existingEnv = new Set(proj.envVars.map((e) => e.name));
      const addedEnv = preset.envVars.filter((e) => !existingEnv.has(e.name));
      return {
        ...proj,
        tools: nextTools,
        agents: nextAgents,
        envVars: [...proj.envVars, ...addedEnv],
      };
    });
  };

  const toggleBuiltinTool = (builtinName: string, desc: string) => {
    onChange((proj) => {
      const target = proj.agents.find((a) => a.name === targetAgent);
      if (!target) return proj;
      const attached = target.tools.includes(builtinName);
      const nextAgents = proj.agents.map((a) =>
        a.name === targetAgent
          ? {
              ...a,
              tools: attached
                ? a.tools.filter((t) => t !== builtinName)
                : [...a.tools, builtinName],
            }
          : a,
      );
      const hasTool = proj.tools.some((t) => t.name === builtinName);
      const nextTools: AdkTool[] = hasTool
        ? proj.tools
        : [
            ...proj.tools,
            {
              name: builtinName,
              kind: "builtin",
              description: desc,
              imports: [],
              dependencies: [],
            },
          ];
      return { ...proj, agents: nextAgents, tools: nextTools };
    });
  };

  const addMcpServerTool = () => {
    const slug = mcpSlug.trim() || "postgres";
    const mcpTool = buildMcpAdkTool(
      slug,
      `${humanize(slug)} MCP Server`,
      `Connects to the ${slug} MCP server (${mcpCommand.trim() || `npx -y @modelcontextprotocol/server-${slug}`}).`,
    );
    onChange((proj) => {
      const has = proj.tools.some((t) => t.name === mcpTool.name);
      return {
        ...proj,
        tools: has ? proj.tools : [...proj.tools, mcpTool],
        agents: proj.agents.map((a) =>
          a.name === targetAgent && !a.tools.includes(mcpTool.name)
            ? { ...a, tools: [...a.tools, mcpTool.name] }
            : a,
        ),
      };
    });
    setMcpSlug("");
  };

  const addCustomFunctionTool = () => {
    const fn = customFnName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!fn) return;
    const desc = customFnDesc.trim() || `Custom Python tool ${fn}.`;
    const newTool: AdkTool = {
      name: fn,
      kind: "function",
      description: desc,
      authType: "none",
      code: [
        `def ${fn}(query: str) -> dict:`,
        `    """${desc}"""`,
        `    return {"status": "ok", "tool": "${fn}", "query": query}`,
      ].join("\n"),
      imports: [],
      dependencies: [],
    };
    onChange((proj) => ({
      ...proj,
      tools: proj.tools.some((t) => t.name === fn) ? proj.tools : [...proj.tools, newTool],
      agents: proj.agents.map((a) =>
        a.name === targetAgent && !a.tools.includes(fn)
          ? { ...a, tools: [...a.tools, fn] }
          : a,
      ),
    }));
    setCustomFnName("");
    setCustomFnDesc("");
  };

  const BUILTIN_DESCRIPTIONS: Record<(typeof ADK_BUILTIN_TOOLS)[number], string> = {
    google_search: "Search the live web with Google Search grounding",
    url_context: "Fetch and extract grounding context from URLs",
    load_memory: "Search long-term session memory on demand",
    preload_memory: "Preload relevant user/session memory before every turn",
    load_artifacts: "Read uploaded files and binary artifacts in the session",
    get_user_choice: "Pause and ask the user to choose between options",
    exit_loop: "Signal a LoopAgent to stop iterating once validation passes",
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Target Agent Picker Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card/80 p-4 shadow-xs">
          <div>
            <p className="text-sm font-semibold">
              Tools, Enterprise Connectors, MCP Toolsets & Domain Skills
            </p>
            <p className="text-xs text-muted-foreground">
              Select a specialist LLM agent below and attach enterprise connectors, Vertex AI Search RAG, MCP servers, or SKILL.md guardrails with one click.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="target-agent-select" className="text-xs font-semibold text-muted-foreground">
              Target Agent:
            </label>
            <select
              id="target-agent-select"
              value={targetAgent}
              onChange={(e) => setTargetAgent(e.target.value)}
              className="h-9 rounded-lg border border-input bg-background px-3 font-mono text-xs font-semibold"
            >
              {llmAgents.map((a) => (
                <option key={a.name} value={a.name}>
                  {a.name} ({a.role || "LLM Agent"})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 1. Enterprise Connectors & Vertex AI RAG */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Plug className="size-4 text-info" /> Enterprise System Connectors & Vertex AI Search RAG
            </h3>
            {brief && (
              <span className="text-xs text-muted-foreground">
                Detected in brief:{" "}
                <strong className="text-foreground">
                  {brief.systems?.map((s) => s.name).join(", ") || "none yet"}
                </strong>
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
            {ENTERPRISE_TOOL_PRESETS.map((preset) => {
              const attached = currentAgent?.tools.includes(preset.name);
              const auth = AUTH_META[preset.authType ?? "secret_manager"];
              return (
                <div
                  key={preset.id}
                  className={cn(
                    "flex flex-col justify-between rounded-xl border p-3.5 transition-colors",
                    attached
                      ? "border-info/60 bg-info/[0.06]"
                      : "bg-card/70 hover:border-primary/40",
                  )}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-semibold">{preset.title}</span>
                      <span
                        className={cn(
                          "shrink-0 rounded-full border px-2 py-0.5 font-mono text-[9.5px]",
                          auth.badgeClass,
                        )}
                      >
                        {auth.short}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-primary">
                      {preset.name}()
                    </p>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                      {preset.description}
                    </p>
                    {preset.envVars.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {preset.envVars.map((ev) => (
                          <span
                            key={ev.name}
                            className="rounded bg-muted px-1.5 py-0.5 font-mono text-[9.5px] text-muted-foreground"
                          >
                            {ev.isSecret ? "🔒 " : ""}
                            {ev.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="mt-3 flex items-center gap-1.5 pt-2">
                    <Button
                      size="sm"
                      variant={attached ? "secondary" : "default"}
                      className="h-7 flex-1 text-xs"
                      onClick={() => attachPresetTool(preset.id)}
                    >
                      {attached ? (
                        <>
                          <CheckCircle2 className="size-3.5 text-success" /> Attached to{" "}
                          {targetAgent}
                        </>
                      ) : (
                        <>
                          <Plus className="size-3.5" /> Add & Attach
                        </>
                      )}
                    </Button>
                    {project.tools.some((t) => t.name === preset.name) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => onSelectTool(preset.name)}
                      >
                        Code
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 2. ADK Built-in Tools */}
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Bot className="size-4 text-primary" /> Google ADK 2.13 Built-In Tools
          </h3>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {ADK_BUILTIN_TOOLS.map((b) => {
              const attached = currentAgent?.tools.includes(b);
              return (
                <button
                  key={b}
                  type="button"
                  onClick={() => toggleBuiltinTool(b, BUILTIN_DESCRIPTIONS[b])}
                  className={cn(
                    "flex flex-col items-start rounded-xl border p-3 text-left transition-colors",
                    attached
                      ? "border-primary bg-primary/[0.08]"
                      : "bg-card/60 hover:border-primary/40",
                  )}
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="font-mono text-xs font-semibold">{b}</span>
                    {attached && <CheckCircle2 className="size-3.5 text-primary" />}
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {BUILTIN_DESCRIPTIONS[b]}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        {/* 3. MCP Server Toolset + Custom Function Builder */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className="space-y-3 rounded-xl border bg-card/70 p-4">
            <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Server className="size-4 text-brand-2" /> Connect MCP Server (ADK McpToolset)
            </h3>
            <p className="text-xs text-muted-foreground">
              Wraps any stdio or SSE Model Context Protocol server as a governed ADK{" "}
              <code>McpToolset</code> and attaches it to <code>{targetAgent}</code>.
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Input
                value={mcpSlug}
                onChange={(e) => setMcpSlug(e.target.value)}
                placeholder="Server name (e.g. github, bigquery, slack)"
                className="h-8 font-mono text-xs"
              />
              <Input
                value={mcpCommand}
                onChange={(e) => setMcpCommand(e.target.value)}
                placeholder="npx -y @modelcontextprotocol/server-..."
                className="h-8 font-mono text-xs"
              />
            </div>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={addMcpServerTool}>
              <Plus className="size-3.5" /> Add MCP Toolset to {targetAgent}
            </Button>
          </section>

          <section className="space-y-3 rounded-xl border bg-card/70 p-4">
            <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <SquareFunction className="size-4 text-success" /> Create Custom Python Function Tool
            </h3>
            <p className="text-xs text-muted-foreground">
              Generates a typed Python function with docstring routing and attaches it to{" "}
              <code>{targetAgent}</code>.
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Input
                value={customFnName}
                onChange={(e) => setCustomFnName(e.target.value)}
                placeholder="Function name (e.g. calculate_tax_variance)"
                className="h-8 font-mono text-xs"
              />
              <Input
                value={customFnDesc}
                onChange={(e) => setCustomFnDesc(e.target.value)}
                placeholder="When should the agent call this tool?"
                className="h-8 text-xs"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={addCustomFunctionTool}
              disabled={!customFnName.trim()}
            >
              <Plus className="size-3.5" /> Create & Attach Python Tool
            </Button>
          </section>
        </div>
      </div>
    </div>
  );
}

/** Tab 3: Connections & Environment Variables Hub (inspired by app.crewai.com/crewai_plus/connections) */
function ConnectionsAndEnvPane({
  project,
  brief,
  onChange,
}: {
  project: AdkProject;
  brief?: Brief;
  onChange: (change: (p: AdkProject) => AdkProject) => void;
}) {
  const [newVarName, setNewVarName] = useState("");
  const [newVarExample, setNewVarExample] = useState("");
  const [newVarDesc, setNewVarDesc] = useState("");
  const [newVarSecret, setNewVarSecret] = useState(false);

  const syncFromBriefAndTools = () => {
    onChange((proj) => ({
      ...proj,
      envVars: syncEnvVarsFromProjectAndBrief(proj, brief),
    }));
  };

  const addEnvVar = () => {
    const clean = newVarName
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!clean) return;
    const item: AdkEnvVar = {
      name: clean,
      example: newVarSecret ? "" : newVarExample.trim() || `<your-${clean.toLowerCase()}>`,
      description: newVarDesc.trim() || (newVarSecret ? "Stored in GCP Secret Manager" : "Non-secret runtime configuration"),
      isSecret: newVarSecret,
      secretRef: newVarSecret ? `${clean}:latest` : undefined,
      authMode: newVarSecret ? "secret_manager" : "adc_wif",
    };
    onChange((proj) => ({
      ...proj,
      envVars: proj.envVars.some((e) => e.name === clean)
        ? proj.envVars.map((e) => (e.name === clean ? item : e))
        : [...proj.envVars, item],
    }));
    setNewVarName("");
    setNewVarExample("");
    setNewVarDesc("");
    setNewVarSecret(false);
  };

  const patchEnvVar = (name: string, patch: Partial<AdkEnvVar>) => {
    onChange((proj) => ({
      ...proj,
      envVars: proj.envVars.map((e) => (e.name === name ? { ...e, ...patch } : e)),
    }));
  };

  const removeEnvVar = (name: string) => {
    onChange((proj) => ({
      ...proj,
      envVars: proj.envVars.filter((e) => e.name !== name),
    }));
  };

  const secretsCount = project.envVars.filter((e) => e.isSecret).length;
  const configCount = project.envVars.length - secretsCount;

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Governance & Zero-Secrets Banner */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/[0.05] p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-semibold">
                Enterprise Connections & Secret Manager Hub (Zero Secrets in Browser)
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Unlike basic SaaS studios that paste raw API keys into the browser, this hub binds every connection to{" "}
                <strong>Workload Identity Federation (ADC/WIF)</strong>,{" "}
                <strong>Google Cloud Secret Manager (<code>--secrets</code>)</strong>, or{" "}
                <strong>Gemini Enterprise OAuth 2.0 User Consent</strong>.
              </p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={syncFromBriefAndTools}>
            <RefreshCw className="size-3.5" /> Auto-Sync from Tools & Brief
          </Button>
        </div>

        {/* 3 Connection Summary Cards */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-xl border bg-card/70 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-primary">
              <Bot className="size-4" /> Vertex AI Model Connection
            </div>
            <p className="mt-1.5 font-mono text-xs font-semibold">
              GOOGLE_GENAI_USE_VERTEXAI=TRUE
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Keyless authentication via Application Default Credentials (local) & Runtime Service Account (Vertex AI).
            </p>
          </div>

          <div className="rounded-xl border bg-card/70 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-warning">
              <KeyRound className="size-4" /> Secret Manager Bindings ({secretsCount})
            </div>
            <p className="mt-1.5 font-mono text-xs font-semibold">
              --secrets=&quot;VAR=SECRET_ID:latest&quot;
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Injected at deploy time by <code>agents-cli deploy</code> or GitLab CI without exposing plaintext values.
            </p>
          </div>

          <div className="rounded-xl border bg-card/70 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-info">
              <Layers className="size-4" /> Non-Secret Env Config ({configCount})
            </div>
            <p className="mt-1.5 font-mono text-xs font-semibold">
              {project.packageName}/.env.example
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Instance URLs, project keys, and dataset IDs emitted to <code>.env.example</code> and{" "}
              <code>agents-cli-manifest.yaml</code>.
            </p>
          </div>
        </div>

        {/* Add New Variable / Secret Reference */}
        <div className="rounded-xl border bg-card/70 p-4">
          <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Add Environment Variable or Secret Manager Reference
          </p>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[1.2fr_1fr_1.4fr_auto_auto]">
            <Input
              value={newVarName}
              onChange={(e) => setNewVarName(e.target.value)}
              placeholder="VARIABLE_NAME (e.g. SAP_CLIENT_SECRET)"
              className="h-8 font-mono text-xs"
            />
            <Input
              value={newVarExample}
              onChange={(e) => setNewVarExample(e.target.value)}
              disabled={newVarSecret}
              placeholder={
                newVarSecret
                  ? "Stored in Secret Manager"
                  : "Example value (e.g. https://...)"
              }
              className="h-8 font-mono text-xs"
            />
            <Input
              value={newVarDesc}
              onChange={(e) => setNewVarDesc(e.target.value)}
              placeholder="Description / Owner team"
              className="h-8 text-xs"
            />
            <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium">
              <input
                type="checkbox"
                checked={newVarSecret}
                onChange={(e) => setNewVarSecret(e.target.checked)}
                className="size-3.5 accent-warning"
              />
              <Lock className="size-3 text-warning" /> Secret
            </label>
            <Button
              size="sm"
              className="h-8 text-xs"
              onClick={addEnvVar}
              disabled={!newVarName.trim()}
            >
              <Plus className="size-3.5" /> Add
            </Button>
          </div>
        </div>

        {/* Variables & Secrets Table */}
        <div className="overflow-hidden rounded-xl border bg-card/80">
          <div className="grid grid-cols-[1.3fr_0.9fr_1.2fr_1.4fr_auto] gap-3 border-b bg-muted/40 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Variable Name</span>
            <span>Kind & Auth</span>
            <span>Example / Secret Ref</span>
            <span>Description & System</span>
            <span>Action</span>
          </div>
          {project.envVars.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              No environment variables or secret references yet. Click{" "}
              <strong>Auto-Sync from Tools & Brief</strong> above or add one manually.
            </div>
          ) : (
            <div className="divide-y">
              {project.envVars.map((ev) => {
                const isSec =
                  ev.isSecret || /SECRET|TOKEN|PASSWORD|KEY/i.test(ev.name);
                return (
                  <div
                    key={ev.name}
                    className="grid grid-cols-1 items-center gap-3 px-4 py-2.5 text-xs sm:grid-cols-[1.3fr_0.9fr_1.2fr_1.4fr_auto]"
                  >
                    <div className="font-mono font-semibold">
                      {ev.name}
                      {ev.boundTo && (
                        <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 font-sans text-[10px] font-normal text-muted-foreground">
                          {ev.boundTo}
                        </span>
                      )}
                    </div>
                    <div>
                      <button
                        type="button"
                        onClick={() =>
                          patchEnvVar(ev.name, {
                            isSecret: !isSec,
                            secretRef: !isSec ? `${ev.name}:latest` : undefined,
                            example: !isSec ? "" : ev.example || `<your-${ev.name.toLowerCase()}>`,
                          })
                        }
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-medium",
                          isSec
                            ? "border-warning/40 bg-warning/10 text-warning"
                            : "border-info/40 bg-info/10 text-info",
                        )}
                      >
                        {isSec ? <Lock className="size-2.5" /> : null}
                        {isSec ? "Secret Manager" : "Non-Secret Env"}
                      </button>
                    </div>
                    <div>
                      {isSec ? (
                        <Input
                          value={ev.secretRef ?? `${ev.name}:latest`}
                          onChange={(e) =>
                            patchEnvVar(ev.name, { secretRef: e.target.value })
                          }
                          className="h-7 font-mono text-[11px]"
                          title="Secret Manager secret ID and version"
                        />
                      ) : (
                        <Input
                          value={ev.example}
                          onChange={(e) =>
                            patchEnvVar(ev.name, { example: e.target.value })
                          }
                          className="h-7 font-mono text-[11px]"
                        />
                      )}
                    </div>
                    <div>
                      <Input
                        value={ev.description}
                        onChange={(e) =>
                          patchEnvVar(ev.name, { description: e.target.value })
                        }
                        className="h-7 text-[11px]"
                      />
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7 text-muted-foreground hover:text-destructive"
                      onClick={() => removeEnvVar(ev.name)}
                      aria-label={`Remove ${ev.name}`}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Tab 4: Interactive Flow Simulator & agents-cli Eval Dataset Builder */
function TestAndEvalPane({
  project,
  onChange,
}: {
  project: AdkProject;
  onChange: (change: (p: AdkProject) => AdkProject) => void;
}) {
  const defaultPrompt =
    project.evalCases?.[0]?.prompt ??
    `Run the ${project.title} workflow and verify all policy and system checks.`;
  const [testPrompt, setTestPrompt] = useState(defaultPrompt);
  const [traceSteps, setTraceSteps] = useState<
    {
      step: number;
      agentName: string;
      agentType: AdkAgent["type"];
      action: string;
      toolsCalled: string[];
      stateWritten?: string;
      guardrailNote: string;
    }[]
  >([]);

  const [newEvalPrompt, setNewEvalPrompt] = useState("");
  const [newEvalExpected, setNewEvalExpected] = useState("");

  const runSimulation = () => {
    const byName = new Map(project.agents.map((a) => [a.name, a]));
    const steps: typeof traceSteps = [];
    let counter = 1;
    const visited = new Set<string>();

    const walk = (name: string) => {
      const a = byName.get(name);
      if (!a || visited.has(name)) return;
      visited.add(name);
      steps.push({
        step: counter++,
        agentName: a.name,
        agentType: a.type,
        action:
          a.type === "llm"
            ? `${a.role || humanize(a.name)} processes request using ${a.model}`
            : `${humanize(a.type)} orchestrator dispatches [${a.subAgents.join(" → ")}]`,
        toolsCalled: a.tools,
        stateWritten: a.outputKey ? `{${a.outputKey}}` : undefined,
        guardrailNote: a.requireConfirmation
          ? "before_tool_guardrail + Human Approval (HITL) gate verified"
          : a.type === "llm"
            ? "before_model_guardrail & before_tool_guardrail passed"
            : "Deterministic workflow handoff",
      });
      a.subAgents.forEach(walk);
    };
    walk(project.rootAgent);
    setTraceSteps(steps);
  };

  const addEvalCase = () => {
    if (!newEvalPrompt.trim()) return;
    const nextCase: AdkEvalCase = {
      id: `eval-${(project.evalCases?.length ?? 0) + 1}`,
      prompt: newEvalPrompt.trim(),
      expectedTools: project.tools.slice(0, 2).map((t) => t.name),
      expectedOutcome:
        newEvalExpected.trim() ||
        `Completes ${project.title} accurately with grounded tool calls.`,
    };
    onChange((proj) => ({
      ...proj,
      evalCases: [...(proj.evalCases ?? []), nextCase],
    }));
    setNewEvalPrompt("");
    setNewEvalExpected("");
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Flow Simulator */}
        <section className="space-y-4 rounded-xl border bg-card/80 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Play className="size-4 text-primary" /> Interactive ADK Flow Simulator (Dry-Run Trace)
              </h3>
              <p className="text-xs text-muted-foreground">
                Test how a prompt or event payload flows across your root agent, sub-agents, tools, session state keys, and safety callbacks before running{" "}
                <code>adk web</code>.
              </p>
            </div>
            <Button size="sm" onClick={runSimulation}>
              <Play className="size-3.5" /> Simulate Flow Trace
            </Button>
          </div>

          <Input
            value={testPrompt}
            onChange={(e) => setTestPrompt(e.target.value)}
            placeholder="Enter a test prompt or event payload..."
            className="h-9 font-mono text-xs"
          />

          {traceSteps.length > 0 && (
            <div className="space-y-2.5 pt-2">
              {traceSteps.map((s) => (
                <div
                  key={s.step}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-muted/25 p-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="flex size-5 items-center justify-center rounded-full bg-primary font-mono text-[10px] font-bold text-primary-foreground">
                        {s.step}
                      </span>
                      <span className="font-mono font-semibold">{s.agentName}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {AGENT_META[s.agentType].label}
                      </span>
                      {s.stateWritten && (
                        <span className="rounded border border-info/40 bg-info/10 px-1.5 py-0.5 font-mono text-[10px] text-info">
                          writes {s.stateWritten}
                        </span>
                      )}
                    </div>
                    <p className="text-muted-foreground">{s.action}</p>
                    {s.toolsCalled.length > 0 && (
                      <p className="font-mono text-[11px] text-success">
                        Tools invoked: {s.toolsCalled.map((t) => `${t}()`).join(", ")}
                      </p>
                    )}
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full border border-success/40 bg-success/10 px-2.5 py-0.5 text-[10.5px] font-medium text-success">
                    <ShieldCheck className="size-3" /> {s.guardrailNote}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* agents-cli Eval Dataset Builder */}
        <section className="space-y-4 rounded-xl border bg-card/80 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <FlaskConical className="size-4 text-brand-2" /> Gemini Platform Eval Dataset (
                <code>tests/eval/datasets/eval_dataset.json</code>)
              </h3>
              <p className="text-xs text-muted-foreground">
                Emits golden test cases scored by <code>agents-cli eval run</code> on{" "}
                <strong>TOOL_USE_QUALITY</strong>, <strong>FINAL_RESPONSE_QUALITY</strong>,{" "}
                <strong>HALLUCINATION</strong>, and <strong>SAFETY</strong>.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <Input
              value={newEvalPrompt}
              onChange={(e) => setNewEvalPrompt(e.target.value)}
              placeholder="User prompt (e.g. Validate PO #45000192 in SAP)"
              className="h-8 text-xs"
            />
            <Input
              value={newEvalExpected}
              onChange={(e) => setNewEvalExpected(e.target.value)}
              placeholder="Expected response summary..."
              className="h-8 text-xs"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={addEvalCase}
              disabled={!newEvalPrompt.trim()}
            >
              <Plus className="size-3.5" /> Add Eval Case
            </Button>
          </div>

          <div className="space-y-2">
            {(project.evalCases?.length
              ? project.evalCases
              : [
                  {
                    id: "eval-smoke-1",
                    prompt: `Run the primary workflow for ${project.title} and summarize the result.`,
                    expectedTools: project.tools.slice(0, 2).map((t) => t.name),
                    expectedOutcome: `Completes the ${project.title} workflow safely and returns a structured summary.`,
                  },
                ]
            ).map((c) => (
              <div
                key={c.id}
                className="flex items-start justify-between gap-3 rounded-lg border bg-background/60 p-3 text-xs"
              >
                <div className="space-y-1">
                  <p className="font-semibold">
                    <span className="mr-2 font-mono text-muted-foreground">{c.id}</span>
                    {c.prompt}
                  </p>
                  <p className="text-muted-foreground">
                    Expected: {c.expectedOutcome}
                  </p>
                  {c.expectedTools.length > 0 && (
                    <p className="font-mono text-[11px] text-primary">
                      Expected tools: {c.expectedTools.join(", ")}
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => {
                    setTestPrompt(c.prompt);
                    runSimulation();
                  }}
                >
                  <Play className="size-3" /> Test
                </Button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

/** Tab 6: Flexible Google Cloud Vertex AI, agents-cli, Gemini Enterprise & Agent Registry Deploy */
function DeployPane({ project }: { project: AdkProject }) {
  const [projectId, setProjectId] = useState("");
  const [region, setRegion] = useState("");
  const [target, setTarget] = useState<
    "agent_runtime" | "cloud_run" | "gke" | "gemini_enterprise"
  >("agent_runtime");
  const [agentIdentity, setAgentIdentity] = useState(true);
  const [agentGateway, setAgentGateway] = useState(false);
  const [cmekKey, setCmekKey] = useState("");

  const pkg = project.packageName;
  const pid = projectId.trim() || "$GOOGLE_CLOUD_PROJECT";
  const reg = region.trim() || "$GOOGLE_CLOUD_LOCATION";

  const secretFlags = project.envVars
    .filter((e) => e.isSecret || /SECRET|TOKEN|PASSWORD|KEY/i.test(e.name))
    .map((s) => `${s.name}=${s.secretRef || `${s.name}:latest`}`)
    .join(",");

  const nonSecretFlags = project.envVars
    .filter((e) => !(e.isSecret || /SECRET|TOKEN|PASSWORD|KEY/i.test(e.name)))
    .map((e) => `${e.name}=${e.example || `<set-${e.name.toLowerCase()}>`}`)
    .join(",");

  const extraEnterpriseFlags = [
    agentIdentity ? "--agent-identity" : "",
    agentGateway ? `--agent-gateway-egress https://gateway.${reg}.rep.googleapis.com` : "",
    cmekKey.trim() ? `--key "${cmekKey.trim()}"` : "",
    secretFlags ? `--secrets="${secretFlags}"` : "",
    nonSecretFlags ? `--env-vars="${nonSecretFlags}"` : "",
  ]
    .filter(Boolean)
    .join(" \\\n  ");

  const deployTargetCmd =
    target === "agent_runtime"
      ? `agents-cli deploy agent-runtime \\\n  --project=${pid} \\\n  --region=${reg} \\\n  --display-name="${project.title.replace(/"/g, "'")}"${extraEnterpriseFlags ? ` \\\n  ${extraEnterpriseFlags}` : ""} \\\n  ${pkg}\n\n# Or with native adk CLI:\nadk deploy agent_engine --project=${pid} --region=${reg} --display_name="${project.title.replace(/"/g, "'")}" ${pkg}`
      : target === "cloud_run"
        ? `agents-cli deploy cloud-run \\\n  --project=${pid} \\\n  --region=${reg} \\\n  --service-name=${pkg.replace(/_/g, "-")}${extraEnterpriseFlags ? ` \\\n  ${extraEnterpriseFlags}` : ""} \\\n  ${pkg}\n\n# Or with native adk CLI:\nadk deploy cloud_run --project=${pid} --region=${reg} --service_name=${pkg.replace(/_/g, "-")} --with_ui ${pkg}`
        : target === "gke"
          ? `agents-cli deploy gke \\\n  --project=${pid} \\\n  --region=${reg} \\\n  --cluster=${pkg.replace(/_/g, "-")}-cluster${extraEnterpriseFlags ? ` \\\n  ${extraEnterpriseFlags}` : ""} \\\n  ${pkg}`
          : `agents-cli publish gemini \\\n  --project=${pid} \\\n  --location=global \\\n  --app-id="$GEMINI_ENTERPRISE_APP_ID" \\\n  --display-name="${project.title.replace(/"/g, "'")}" \\\n  --agent-engine="$REASONING_ENGINE_RESOURCE_NAME"`;

  const steps: { title: string; body: string; cmd: string }[] = [
    {
      title: "1 · Run Locally in ADK Web UI & Terminal (Vertex AI ADC)",
      body: "Uses Google Cloud Application Default Credentials — zero static API keys.",
      cmd: `unzip ${pkg}-adk.zip && cd ${pkg}\npython -m venv .venv && source .venv/bin/activate\npip install -r requirements.txt\ncp ${pkg}/.env.example ${pkg}/.env\ngcloud auth application-default login\nadk web                         # Interactive trace UI at http://localhost:8000\nadk run ${pkg}                  # Or chat in the terminal`,
    },
    {
      title: "2 · Run Quality Flywheel Evaluation (agents-cli eval)",
      body: "Executes your golden evaluation suite (TOOL_USE_QUALITY, FINAL_RESPONSE_QUALITY, HALLUCINATION, SAFETY) before deployment.",
      cmd: `agents-cli eval run --config tests/eval/eval_config.yaml`,
    },
    {
      title: `3 · Deploy to Google Cloud (${
        target === "agent_runtime"
          ? "Vertex AI Agent Runtime"
          : target === "cloud_run"
            ? "Cloud Run"
            : target === "gke"
              ? "Google Kubernetes Engine"
              : "Gemini Enterprise & Agent Registry"
      })`,
      body: "Flexible enterprise deployment with Secret Manager bindings, Agent Identity, and optional Agent Gateway egress.",
      cmd: deployTargetCmd,
    },
    {
      title: "4 · Register with Gemini Enterprise & Agent Registry",
      body: "Publishes your deployed ADK agent to Gemini Enterprise and registers its tools/MCP servers in Google Cloud Agent Registry.",
      cmd: `agents-cli publish gemini \\\n  --project=${pid} \\\n  --location=global \\\n  --app-id="$GEMINI_ENTERPRISE_APP_ID" \\\n  --display-name="${project.title.replace(/"/g, "'")}" \\\n  --description="${(project.description || project.title).replace(/"/g, "'")}" \\\n  --agent-engine="$REASONING_ENGINE_RESOURCE_NAME"`,
    },
    {
      title: "5 · Governed GitLab CI / Workload Identity Federation Pipeline",
      body: "Validates mandatory governance artifacts and deploys from protected release tags via keyless WIF.",
      cmd: `python scripts/check_mandatory_files.py --agent ${pkg}\n# Triggered automatically in .gitlab-ci.yml via deploy/deploy_gcp.py`,
    },
  ];

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        {/* Target & Enterprise Options Configurator */}
        <div className="space-y-4 rounded-xl border bg-card/70 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className={label} htmlFor="gcp-project">
                Google Cloud Project ID
              </label>
              <Input
                id="gcp-project"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                placeholder="e.g. my-enterprise-gcp-project"
                className="h-9 font-mono text-xs"
              />
            </div>
            <div>
              <label className={label} htmlFor="gcp-region">
                Vertex AI Region
              </label>
              <select
                id="gcp-region"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="h-9 w-full rounded-lg border border-input bg-background px-3 font-mono text-xs"
              >
                <option value="">Select a region…</option>
                {GCP_REGIONS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label} htmlFor="deploy-target">
                Deployment Target
              </label>
              <select
                id="deploy-target"
                value={target}
                onChange={(e) =>
                  setTarget(
                    e.target.value as
                      | "agent_runtime"
                      | "cloud_run"
                      | "gke"
                      | "gemini_enterprise",
                  )
                }
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-xs font-medium"
              >
                <option value="agent_runtime">Vertex AI Agent Runtime (Managed)</option>
                <option value="cloud_run">Cloud Run (Container + ADK Web UI)</option>
                <option value="gke">GKE (Kubernetes Cluster)</option>
                <option value="gemini_enterprise">Gemini Enterprise + Agent Registry</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2.5 pt-1 sm:grid-cols-3">
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border bg-background/60 px-3 py-2 text-xs">
              <input
                type="checkbox"
                checked={agentIdentity}
                onChange={(e) => setAgentIdentity(e.target.checked)}
                className="size-3.5 accent-primary"
              />
              <span>Enable Agent Identity (<code>--agent-identity</code>)</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border bg-background/60 px-3 py-2 text-xs">
              <input
                type="checkbox"
                checked={agentGateway}
                onChange={(e) => setAgentGateway(e.target.checked)}
                className="size-3.5 accent-primary"
              />
              <span>Bind Agent Gateway Egress</span>
            </label>
            <Input
              value={cmekKey}
              onChange={(e) => setCmekKey(e.target.value)}
              placeholder="Optional CMEK KMS key path (--key)"
              className="h-9 font-mono text-xs"
            />
          </div>
        </div>

        {steps.map((s) => (
          <section key={s.title} className="rounded-xl border bg-card/70">
            <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
              <div>
                <p className="text-sm font-semibold">{s.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{s.body}</p>
              </div>
              <CopyButton value={s.cmd} size="sm" label="Copy" />
            </div>
            <pre className="overflow-x-auto bg-muted/30 p-4 font-mono text-[12px] leading-relaxed">
              {s.cmd}
            </pre>
          </section>
        ))}
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Copy className="size-3.5" /> Commands support both Google{" "}
          <code>agents-cli</code> and <code>adk</code> 2.13 CLI with Workload Identity Federation & Secret Manager.
        </p>
      </div>
    </div>
  );
}
