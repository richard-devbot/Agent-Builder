/**
 * Turn a loosely-shaped agent-system design (model output, or a user's edit)
 * into a valid AdkProject. Where bleachAgentBuilder's validator only reported
 * errors, this repairs them and records a warning, so the generated package
 * always forms a tree google-adk accepts:
 *   - Python-identifier names, unique across agents and tools ("user" is reserved)
 *   - a root agent that exists; every agent reachable from it exactly once
 *     (ADK agents can have only one parent) and no cycles
 *   - LlmAgents have a model and instruction; workflow agents have sub-agents
 *     and no tools (they don't call a model)
 *   - tool references resolve; builtin tools name a real ADK builtin;
 *     function tools contain a matching `def`
 */

import {
  ADK_AGENT_TYPES,
  ADK_BUILTIN_TOOLS,
  type AdkAgent,
  type AdkAgentType,
  type AdkBuiltinTool,
  type AdkEnvVar,
  type AdkProject,
  type AdkTool,
} from "@/contracts/adk";
import { DEFAULT_GEMINI_MODEL } from "@/lib/config/public";

export const DEFAULT_ADK_MODEL = DEFAULT_GEMINI_MODEL;

export type LooseAdkProject = {
  packageName?: string;
  title?: string;
  description?: string;
  rootAgent?: string;
  agents?: {
    name?: string;
    type?: string;
    description?: string;
    model?: string;
    instruction?: string;
    tools?: string[];
    subAgents?: string[];
    outputKey?: string;
    maxIterations?: number;
  }[];
  tools?: {
    name?: string;
    kind?: string;
    description?: string;
    builtin?: string;
    code?: string;
    imports?: string[];
    dependencies?: string[];
  }[];
  envVars?: { name?: string; example?: string; description?: string }[];
};

const PY_KEYWORDS = new Set(
  "false none true and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case".split(" "),
);
// Names that would shadow the imports or the module-level `root_agent` in agent.py.
const RESERVED = new Set(["user", "root_agent", "llmagent", "sequentialagent", "parallelagent", "loopagent", "agenttool", "types", ...ADK_BUILTIN_TOOLS]);

const clip = (s: string | undefined, n: number) => {
  const t = (s ?? "").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

export function pyName(raw: string | undefined, fallback: string): string {
  let n = (raw ?? "")
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .slice(0, 60);
  if (!n) n = fallback;
  if (/^[0-9]/.test(n)) n = `a_${n}`;
  if (PY_KEYWORDS.has(n)) n = `${n}_`;
  return n;
}

/** Lines of Python that look dangerous enough for a reviewer to look twice. */
const RISKY: [RegExp, string][] = [
  [/\bos\.system\(/, "os.system"],
  [/\bsubprocess\./, "subprocess"],
  [/\beval\(/, "eval"],
  [/\bexec\(/, "exec"],
  [/\bshutil\.rmtree\(/, "shutil.rmtree"],
  [/\b__import__\(/, "__import__"],
];

export function normalizeAdkProject(input: LooseAdkProject, fallbackTitle = "Agent system"): AdkProject {
  const warnings: string[] = [];
  const taken = new Set<string>();
  const claim = (base: string, kind: "agent" | "tool") => {
    let n = base;
    if (RESERVED.has(n) && !(kind === "tool" && (ADK_BUILTIN_TOOLS as readonly string[]).includes(n))) n = `${n}_${kind}`;
    let i = 2;
    while (taken.has(n)) n = `${base}_${i++}`;
    taken.add(n);
    return n;
  };

  // ── tools ────────────────────────────────────────────────────────────────
  const toolRename = new Map<string, string>();
  const tools: AdkTool[] = [];
  for (const [i, t] of (input.tools ?? []).slice(0, 16).entries()) {
    const builtin = (ADK_BUILTIN_TOOLS as readonly string[]).includes(t.builtin ?? "")
      ? (t.builtin as AdkBuiltinTool)
      : (ADK_BUILTIN_TOOLS as readonly string[]).includes(t.name ?? "")
        ? (t.name as AdkBuiltinTool)
        : undefined;
    const wantsBuiltin = t.kind === "builtin" || (!t.code && builtin);
    if (wantsBuiltin && !builtin) {
      warnings.push(`Tool "${t.name}" asked for an unknown built-in; it was turned into a function stub.`);
    }
    const original = t.name ?? `tool_${i + 1}`;
    if (wantsBuiltin && builtin) {
      if (taken.has(builtin)) {
        toolRename.set(original, builtin);
        continue;
      }
      taken.add(builtin);
      toolRename.set(original, builtin);
      tools.push({ name: builtin, kind: "builtin", builtin, description: clip(t.description, 400) || builtin, imports: [], dependencies: [] });
      continue;
    }
    const name = claim(pyName(original, `tool_${i + 1}`), "tool");
    toolRename.set(original, name);
    toolRename.set(pyName(original, ""), name);
    const description = clip(t.description, 400) || `Function tool ${name}.`;
    let code = (t.code ?? "").replace(/\r\n/g, "\n").trim();
    const def = /^(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/m.exec(code);
    if (!def) {
      if (code) warnings.push(`Tool "${name}" had no Python function; replaced with a stub to implement.`);
      code = stubFunction(name, description);
    } else if (def[1] !== name) {
      // Keep the model's body but make the function name match the tool name.
      code = code.replace(new RegExp(`(def\\s+)${def[1]}(\\s*\\()`), `$1${name}$2`);
    }
    for (const [re, label] of RISKY) if (re.test(code)) warnings.push(`Tool "${name}" uses ${label}: review before running.`);
    tools.push({
      name,
      kind: "function",
      description,
      code: code.slice(0, 8_000),
      imports: [...new Set((t.imports ?? []).map((l) => l.trim()).filter((l) => /^(import|from)\s+[A-Za-z_]/.test(l)))].slice(0, 12),
      dependencies: [...new Set((t.dependencies ?? []).map((d) => d.trim()).filter((d) => /^[A-Za-z0-9][A-Za-z0-9._\-\[\]<>=!~, ]{0,79}$/.test(d)))]
        .filter((d) => !/^google-adk\b/.test(d))
        .slice(0, 12),
    });
  }

  // ── agents ───────────────────────────────────────────────────────────────
  const rawAgents = (input.agents ?? []).slice(0, 12);
  if (rawAgents.length === 0) {
    rawAgents.push({ name: "assistant", type: "llm", description: input.description, instruction: input.description });
    warnings.push("The design had no agents; a single assistant agent was created.");
  }
  const agentRename = new Map<string, string>();
  const agents: AdkAgent[] = rawAgents.map((a, i) => {
    const name = claim(pyName(a.name, `agent_${i + 1}`), "agent");
    agentRename.set(a.name ?? "", name);
    agentRename.set(pyName(a.name, ""), name);
    const type = (ADK_AGENT_TYPES as readonly string[]).includes((a.type ?? "").replace(/_agent$/, ""))
      ? ((a.type ?? "").replace(/_agent$/, "") as AdkAgentType)
      : "llm";
    return {
      name,
      type,
      description: clip(a.description, 400) || `${name.replace(/_/g, " ")} agent.`,
      model: clip(a.model, 80) || undefined,
      instruction: clip(a.instruction, 6_000) || undefined,
      tools: a.tools ?? [],
      subAgents: a.subAgents ?? [],
      outputKey: a.outputKey ? pyName(a.outputKey, "") || undefined : undefined,
      maxIterations: a.maxIterations,
    };
  });
  const byName = new Map(agents.map((a) => [a.name, a]));
  const toolNames = new Set(tools.map((t) => t.name));

  for (const a of agents) {
    // Resolve references through the rename maps, dropping what doesn't exist.
    a.subAgents = [
      ...new Set(
        a.subAgents
          .map((s) => agentRename.get(s) ?? agentRename.get(pyName(s, "")) ?? "")
          .filter((s) => {
            if (s && byName.has(s) && s !== a.name) return true;
            return false;
          }),
      ),
    ];
    const resolved: string[] = [];
    for (const t of a.tools) {
      const n = toolRename.get(t) ?? toolRename.get(pyName(t, "")) ?? (toolNames.has(t) ? t : "");
      if (n && toolNames.has(n)) resolved.push(n);
      else warnings.push(`Agent "${a.name}" referenced unknown tool "${t}"; removed.`);
    }
    a.tools = [...new Set(resolved)].slice(0, 12);
  }

  // Root: the named root, else an agent nobody else lists as a sub-agent.
  const children = new Set(agents.flatMap((a) => a.subAgents));
  let root = agentRename.get(input.rootAgent ?? "") ?? agentRename.get(pyName(input.rootAgent, ""));
  if (!root || !byName.has(root)) {
    root = agents.find((a) => !children.has(a.name))?.name ?? agents[0].name;
    if (input.rootAgent) warnings.push(`Root agent "${input.rootAgent}" was not defined; using "${root}".`);
  }

  // Walk the tree from the root: each agent gets one parent, cycles are cut.
  const seen = new Set<string>([root]);
  const walk = (name: string) => {
    const a = byName.get(name)!;
    a.subAgents = a.subAgents.filter((c) => {
      if (seen.has(c)) {
        warnings.push(`"${c}" was listed under more than one parent (or formed a cycle); kept only its first parent.`);
        return false;
      }
      seen.add(c);
      return true;
    });
    a.subAgents.forEach(walk);
  };
  walk(root);
  const unreachable = agents.filter((a) => !seen.has(a.name));
  for (const a of unreachable) warnings.push(`Agent "${a.name}" wasn't reachable from the root and was removed.`);
  const kept = agents.filter((a) => seen.has(a.name));

  for (const a of kept) {
    if (a.type !== "llm" && a.subAgents.length === 0) {
      warnings.push(`${a.type} agent "${a.name}" had no sub-agents; changed to an LLM agent.`);
      a.type = "llm";
    }
    if (a.type === "llm") {
      a.model ||= DEFAULT_ADK_MODEL;
      if (!a.instruction) {
        a.instruction = `You are ${a.name.replace(/_/g, " ")}. ${a.description}`;
        warnings.push(`LLM agent "${a.name}" had no instruction; a minimal one was written from its description.`);
      }
      a.maxIterations = undefined;
      const builtins = a.tools.filter((t) => tools.find((x) => x.name === t)?.kind === "builtin" && ["google_search", "url_context"].includes(t));
      if (builtins.length && a.tools.length > builtins.length) {
        warnings.push(`"${a.name}" mixes ${builtins.join(", ")} with other tools; Gemini may reject this. Consider a dedicated search agent.`);
      }
    } else {
      if (a.tools.length) warnings.push(`${a.type} agent "${a.name}" can't call tools; moved its tools off.`);
      a.tools = [];
      a.model = undefined;
      a.instruction = undefined;
      a.outputKey = undefined;
      a.maxIterations = a.type === "loop" ? Math.min(10, Math.max(1, a.maxIterations ?? 3)) : undefined;
    }
  }

  const usedTools = new Set(kept.flatMap((a) => a.tools));
  const keptTools = tools.filter((t) => usedTools.has(t.name));
  for (const t of tools) if (!usedTools.has(t.name)) warnings.push(`Tool "${t.name}" wasn't used by any agent and was dropped.`);

  const envVars: AdkEnvVar[] = [];
  for (const e of input.envVars ?? []) {
    const name = (e.name ?? "").toUpperCase().replace(/[^A-Z0-9_]/g, "_").replace(/^[^A-Z]+/, "");
    if (!name || envVars.some((x) => x.name === name) || /^GOOGLE_(API_KEY|GENAI_USE_VERTEXAI|CLOUD_PROJECT|CLOUD_LOCATION)$/.test(name)) continue;
    // Only placeholders: real values never belong in a generated example file.
    envVars.push({ name: name.slice(0, 63), example: clip(e.example, 200) || "your-value", description: clip(e.description, 200) });
  }

  return {
    packageName: pyName(input.packageName || input.title, "agent_system"),
    title: clip(input.title, 80) || fallbackTitle,
    description: clip(input.description, 600),
    rootAgent: root,
    agents: kept,
    tools: keptTools,
    envVars: envVars.slice(0, 12),
    warnings: [...new Set(warnings)].slice(0, 30),
  };
}

function stubFunction(name: string, description: string): string {
  return `def ${name}(query: str) -> dict:
    """${description.replace(/"""/g, "'''")}

    Args:
        query: What to look up or act on.

    Returns:
        A dict with a "status" key and the result.
    """
    # TODO: implement against your system.
    return {"status": "not_implemented", "query": query}`;
}
