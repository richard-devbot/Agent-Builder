"use client";

/**
 * Full-screen Blueprint studio for the Google ADK agent system, modelled on
 * bleachAgentBuilder's graph + config panel + code editor: select a node to
 * edit it, read the generated Python live, download the package, and copy the
 * commands that run or deploy it.
 */

import { useMemo, useState } from "react";
import { AlertTriangle, Code2, Copy, Download, Network, Rocket, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";
import type { AdkAgent, AdkProject, AdkTool } from "@/contracts/adk";
import { generateAdkProject } from "@/lib/adk/generate";
import { ADK_MODELS } from "@/lib/adk/models";
import { GCP_REGIONS } from "@/lib/config/public";
import { createZip } from "@/lib/kit/zip";
import { AGENT_META, ToolIcon, type AdkSelection } from "./adk-meta";
import { AdkFlow } from "./adk-flow";

type Pane = "graph" | "code" | "deploy";

export function downloadAdk(project: AdkProject) {
  const blob = createZip(generateAdkProject(project).map((f) => ({ path: `${project.packageName}/${f.path}`, contents: f.contents })));
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${project.packageName}-adk.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

export function BlueprintStudio({
  project,
  open,
  onOpenChange,
  onChange,
}: {
  project: AdkProject;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onChange: (change: (p: AdkProject) => AdkProject) => void;
}) {
  const [pane, setPane] = useState<Pane>("graph");
  const [selected, setSelected] = useState<AdkSelection>({ kind: "agent", name: project.rootAgent });
  const files = useMemo(() => generateAdkProject(project), [project]);
  const [file, setFile] = useState(`${project.packageName}/agent.py`);
  const current = files.find((f) => f.path === file) ?? files[0];

  const agent = selected?.kind === "agent" ? project.agents.find((a) => a.name === selected.name) : undefined;
  const tool = selected?.kind === "tool" ? project.tools.find((t) => t.name === selected.name) : undefined;

  const patchAgent = (name: string, p: Partial<AdkAgent>) =>
    onChange((proj) => ({ ...proj, agents: proj.agents.map((a) => (a.name === name ? { ...a, ...p } : a)) }));
  const patchTool = (name: string, p: Partial<AdkTool>) =>
    onChange((proj) => ({ ...proj, tools: proj.tools.map((t) => (t.name === name ? { ...t, ...p } : t)) }));

  const counts = {
    llm: project.agents.filter((a) => a.type === "llm").length,
    workflow: project.agents.filter((a) => a.type !== "llm").length,
    fn: project.tools.filter((t) => t.kind === "function").length,
    builtin: project.tools.filter((t) => t.kind === "builtin").length,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="flex h-[94dvh] max-w-[97vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[97vw]">
        {/* Header */}
        <header className="flex flex-wrap items-center gap-3 border-b bg-gradient-to-r from-primary/10 via-transparent to-transparent px-5 py-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand-2 text-primary-foreground shadow-md shadow-primary/25">
            <Network className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-base font-semibold">{project.title}</DialogTitle>
            <p className="truncate text-xs text-muted-foreground">
              Google ADK agent system · <span className="font-mono">{project.packageName}</span> · {counts.llm} LLM + {counts.workflow} workflow agents ·{" "}
              {counts.fn} function + {counts.builtin} built-in tools
            </p>
          </div>
          <div role="tablist" className="flex rounded-lg border bg-background/70 p-0.5">
            {(
              [
                ["graph", Network, "Graph"],
                ["code", Code2, "Code"],
                ["deploy", Rocket, "Run & deploy"],
              ] as const
            ).map(([id, Icon, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={pane === id}
                onClick={() => setPane(id)}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors",
                  pane === id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" /> {label}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={() => downloadAdk(project)}>
            <Download className="size-3.5" /> Download ADK project
          </Button>
          <Button size="icon" variant="ghost" onClick={() => onOpenChange(false)} aria-label="Close studio">
            <X className="size-4" />
          </Button>
        </header>

        {project.warnings.length > 0 && (
          <details className="border-b bg-warning/5 px-5 py-2 text-xs">
            <summary className="inline-flex cursor-pointer items-center gap-1.5 font-medium text-warning">
              <AlertTriangle className="size-3.5" /> {project.warnings.length} validator note{project.warnings.length > 1 ? "s" : ""}: the design was repaired automatically
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
            <div className="grid h-full grid-cols-1 lg:grid-cols-[minmax(0,1fr)_26rem]">
              <div className="relative min-h-[28rem] bg-muted/20">
                <AdkFlow project={project} selected={selected} onSelect={setSelected} />
                <Legend />
              </div>
              <aside className="min-h-0 overflow-y-auto border-l bg-card/60">
                {agent && <AgentInspector key={agent.name} agent={agent} project={project} onPatch={(p) => patchAgent(agent.name, p)} onSelectTool={(n) => setSelected({ kind: "tool", name: n })} />}
                {tool && <ToolInspector key={tool.name} tool={tool} project={project} onPatch={(p) => patchTool(tool.name, p)} />}
                {!agent && !tool && <p className="p-6 text-sm text-muted-foreground">Select an agent or tool in the graph.</p>}
              </aside>
            </div>
          )}

          {pane === "code" && (
            <div className="grid h-full grid-cols-1 md:grid-cols-[15rem_minmax(0,1fr)]">
              <nav aria-label="Files" className="min-h-0 overflow-y-auto border-r bg-card/60 p-2">
                <p className="px-2 pt-1 pb-2 font-mono text-[11px] text-muted-foreground">{project.packageName}/</p>
                {files.map((f) => (
                  <button
                    key={f.path}
                    type="button"
                    onClick={() => setFile(f.path)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-mono text-[12px] transition-colors",
                      current.path === f.path ? "bg-primary/12 text-foreground" : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    <Code2 className="size-3.5 shrink-0" />
                    <span className="truncate">{f.path}</span>
                  </button>
                ))}
              </nav>
              <div className="flex min-h-0 flex-col">
                <div className="flex items-center justify-between border-b px-4 py-2">
                  <span className="font-mono text-xs text-muted-foreground">{current.path}</span>
                  <CopyButton value={current.contents} size="sm" label="Copy" />
                </div>
                <pre className="min-h-0 flex-1 overflow-auto bg-muted/30 p-4 text-[12px] leading-[1.6]">
                  <code>
                    {current.contents.split("\n").map((line, i) => (
                      <span key={i} className="block">
                        <span className="mr-4 inline-block w-8 text-right text-muted-foreground/50 select-none">{i + 1}</span>
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
          <span className={cn("flex size-4 items-center justify-center rounded border", m.tone)}>
            <m.icon className="size-2.5" />
          </span>
          {m.label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2 rounded-full border border-dashed border-success" /> tool
      </span>
    </div>
    </div>
  );
}

const label = "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground";

function AgentInspector({
  agent,
  project,
  onPatch,
  onSelectTool,
}: {
  agent: AdkAgent;
  project: AdkProject;
  onPatch: (p: Partial<AdkAgent>) => void;
  onSelectTool: (name: string) => void;
}) {
  const meta = AGENT_META[agent.type];
  const parent = project.agents.find((a) => a.subAgents.includes(agent.name));
  const reads = [...(agent.instruction ?? "").matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\??\}/g)].map((m) => m[1]);
  return (
    <div className="space-y-4 p-5">
      <div className="flex items-center gap-3">
        <span className={cn("flex size-10 items-center justify-center rounded-xl border-2", meta.tone)}>
          <meta.icon className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-mono text-sm font-semibold">{agent.name}</p>
          <p className="text-xs text-muted-foreground">
            {meta.label}
            {agent.name === project.rootAgent ? " · root agent" : parent ? ` · under ${parent.name}` : ""}
          </p>
        </div>
      </div>

      <div>
        <label className={label} htmlFor="adk-desc">
          Description <span className="font-normal normal-case tracking-normal">(used for routing)</span>
        </label>
        <Textarea id="adk-desc" value={agent.description} onChange={(e) => onPatch({ description: e.target.value })} className="min-h-16 text-sm" />
      </div>

      {agent.type === "llm" ? (
        <>
          <div>
            <label className={label} htmlFor="adk-model">
              Model
            </label>
            <select
              id="adk-model"
              value={agent.model}
              onChange={(e) => onPatch({ model: e.target.value })}
              className="h-9 w-full rounded-md border border-input bg-background px-2.5 font-mono text-sm"
            >
              {!ADK_MODELS.some((m) => m.id === agent.model) && <option value={agent.model}>{agent.model}</option>}
              {ADK_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id} · {m.note}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="adk-instr">
              Instruction
            </label>
            <Textarea id="adk-instr" value={agent.instruction ?? ""} onChange={(e) => onPatch({ instruction: e.target.value })} className="min-h-56 font-mono text-xs leading-5" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label} htmlFor="adk-out">
                Writes state
              </label>
              <Input
                id="adk-out"
                value={agent.outputKey ?? ""}
                onChange={(e) => onPatch({ outputKey: e.target.value.replace(/[^a-z0-9_]/g, "") || undefined })}
                placeholder="output_key"
                className="h-8 font-mono text-xs"
              />
            </div>
            <div>
              <p className={label}>Reads state</p>
              <p className="pt-1.5 font-mono text-xs text-muted-foreground">{reads.length ? reads.map((r) => `{${r}}`).join(" ") : "none"}</p>
            </div>
          </div>
          {agent.tools.length > 0 && (
            <div>
              <p className={label}>Tools</p>
              <div className="flex flex-wrap gap-1.5">
                {agent.tools.map((t) => (
                  <button key={t} type="button" onClick={() => onSelectTool(t)} className="rounded-full border border-dashed border-success/50 px-2.5 py-1 font-mono text-[11px] hover:bg-success/10">
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="rounded-lg border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
          {agent.type === "sequential" && "Runs its sub-agents in the order shown, passing results through session state."}
          {agent.type === "parallel" && "Runs its sub-agents at the same time; a later agent combines their outputs."}
          {agent.type === "loop" && (
            <>
              Repeats its sub-agents until one calls <code>exit_loop</code> or the limit is reached.
              <label className={cn(label, "mt-3")} htmlFor="adk-iter">
                Max iterations
              </label>
              <Input
                id="adk-iter"
                type="number"
                min={1}
                max={10}
                value={agent.maxIterations ?? 3}
                onChange={(e) => onPatch({ maxIterations: Math.min(10, Math.max(1, Number(e.target.value) || 1)) })}
                className="h-8 w-24 text-sm"
              />
            </>
          )}
          <p className="mt-2">Workflow agents don&apos;t call a model, so they have no instruction or tools.</p>
        </div>
      )}
    </div>
  );
}

function ToolInspector({ tool, project, onPatch }: { tool: AdkTool; project: AdkProject; onPatch: (p: Partial<AdkTool>) => void }) {
  const users = project.agents.filter((a) => a.tools.includes(tool.name)).map((a) => a.name);
  return (
    <div className="space-y-4 p-5">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl border-2 border-dashed border-success/60 text-success">
          <ToolIcon tool={tool} className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-mono text-sm font-semibold">{tool.name}</p>
          <p className="text-xs text-muted-foreground">
            {tool.kind === "builtin" ? "ADK built-in tool" : "Python function tool"} · used by {users.join(", ")}
          </p>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{tool.description}</p>
      {tool.kind === "function" ? (
        <>
          <div>
            <label className={label} htmlFor="adk-code">
              Function <span className="font-normal normal-case tracking-normal">(the docstring tells the model when to call it)</span>
            </label>
            <Textarea id="adk-code" value={tool.code ?? ""} onChange={(e) => onPatch({ code: e.target.value })} spellCheck={false} className="min-h-80 font-mono text-[11.5px] leading-5" />
          </div>
          {(tool.imports.length > 0 || tool.dependencies.length > 0) && (
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className={label}>Imports</p>
                <pre className="font-mono text-[11px] whitespace-pre-wrap text-muted-foreground">{tool.imports.join("\n") || "none"}</pre>
              </div>
              <div>
                <p className={label}>pip packages</p>
                <pre className="font-mono text-[11px] whitespace-pre-wrap text-muted-foreground">{tool.dependencies.join("\n") || "none"}</pre>
              </div>
            </div>
          )}
        </>
      ) : (
        <pre className="rounded-lg border bg-muted/30 p-3 font-mono text-xs">from google.adk.tools import {tool.name}</pre>
      )}
    </div>
  );
}

function DeployPane({ project }: { project: AdkProject }) {
  const [projectId, setProjectId] = useState("");
  const [region, setRegion] = useState("");
  const pkg = project.packageName;
  const pid = projectId.trim() || "$GOOGLE_CLOUD_PROJECT";
  const reg = region.trim() || "$GOOGLE_CLOUD_LOCATION";
  const steps: { title: string; body: string; cmd: string }[] = [
    {
      title: "1 · Run locally with Vertex AI ADC",
      body: "Uses Google Cloud Vertex AI Application Default Credentials. No API keys.",
      cmd: `unzip ${pkg}-adk.zip && cd ${pkg}\npython -m venv .venv && source .venv/bin/activate\npip install -r requirements.txt\ncp ${pkg}/.env.example ${pkg}/.env\ngcloud auth application-default login\nadk web                         # http://localhost:8000\n# or: adk run ${pkg}`,
    },
    {
      title: "2 · Deploy via GitLab CI (Workload Identity Federation)",
      body: "Use Step 6 (Push to GitLab) and Step 7 (Deploy to Cloud) to deploy from a protected release tag without local keys.",
      cmd: `python scripts/check_mandatory_files.py --agent ${pkg}`,
    },
    {
      title: "3 · Sign in to Google Cloud for operator CLI checks",
      body: "Deploys use OAuth / Workload Identity Federation, never static keys.",
      cmd: `gcloud auth login\ngcloud auth application-default login\ngcloud config set project ${pid}\ngcloud services enable aiplatform.googleapis.com cloudresourcemanager.googleapis.com run.googleapis.com cloudbuild.googleapis.com`,
    },
    {
      title: "4a · Deploy to Agent Engine (Vertex AI)",
      body: "Fully managed, auto-scaling agent hosting on Vertex AI.",
      cmd: `adk deploy agent_engine --project=${pid} --region=${reg} --display_name="${project.title.replace(/"/g, "'")}" ${pkg}`,
    },
    {
      title: "4b · Or deploy to Cloud Run (container + web UI)",
      body: "Builds a container with Cloud Build and serves the ADK API.",
      cmd: `adk deploy cloud_run --project=${pid} --region=${reg} --service_name=${pkg.replace(/_/g, "-")} --with_ui ${pkg}`,
    },
  ];
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="grid grid-cols-1 gap-3 rounded-xl border bg-card/70 p-4 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="gcp-project">
              Google Cloud project ID
            </label>
            <Input id="gcp-project" value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="e.g. my-team-agent" className="h-9 font-mono text-sm" />
          </div>
          <div>
            <label className={label} htmlFor="gcp-region">
              Region
            </label>
            <select
              id="gcp-region"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="h-9 w-full rounded-lg border border-input bg-background px-3 font-mono text-sm"
            >
              <option value="">Select a region…</option>
              {GCP_REGIONS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
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
            <pre className="overflow-x-auto bg-muted/30 p-4 font-mono text-[12px] leading-relaxed">{s.cmd}</pre>
          </section>
        ))}
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Copy className="size-3.5" /> Commands follow the ADK 2.13 CLI. Free-trial credits cover Vertex AI, Cloud Run and Cloud Build usage.
        </p>
      </div>
    </div>
  );
}
