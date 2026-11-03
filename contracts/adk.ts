/**
 * Google ADK agent-system blueprint: the runnable multi-agent design the
 * Solution Architect produces from a discovery brief.
 *
 * Reverse-engineered from bleachAgentBuilder's AgentProjectConfig
 * (agents of four ADK types, builtin and custom-function tools, a root agent),
 * checked against google-adk 2.13. lib/adk/normalize.ts enforces the
 * structural rules; lib/adk/generate.ts turns it into Python.
 */

import { z } from "zod";

/** ADK workflow types plus the model-driven LlmAgent. */
export const ADK_AGENT_TYPES = ["llm", "sequential", "parallel", "loop"] as const;

/** Built-in tools exported by google.adk.tools. */
export const ADK_BUILTIN_TOOLS = [
  "google_search",
  "url_context",
  "load_memory",
  "preload_memory",
  "load_artifacts",
  "get_user_choice",
  "exit_loop",
] as const;

const pyIdent = z.string().regex(/^[a-z_][a-z0-9_]{0,62}$/);

export const AdkToolSchema = z.object({
  name: pyIdent,
  kind: z.enum(["builtin", "function"]),
  description: z.string().max(400),
  builtin: z.enum(ADK_BUILTIN_TOOLS).optional(),
  /** Complete Python `def` for function tools; its docstring is what the model sees. */
  code: z.string().max(8_000).optional(),
  /** Extra import lines the function needs. */
  imports: z.array(z.string().max(200)).max(12),
  /** Extra pip packages the function needs. */
  dependencies: z.array(z.string().max(80)).max(12),
});

export const AdkAgentSchema = z.object({
  name: pyIdent,
  type: z.enum(ADK_AGENT_TYPES),
  description: z.string().max(400),
  /** LlmAgent only. */
  model: z.string().max(80).optional(),
  instruction: z.string().max(6_000).optional(),
  tools: z.array(pyIdent).max(12),
  subAgents: z.array(pyIdent).max(12),
  /** Session-state key the agent's final answer is written to (LlmAgent). */
  outputKey: pyIdent.optional(),
  /** LoopAgent only. */
  maxIterations: z.number().int().min(1).max(10).optional(),
});

export const AdkEnvVarSchema = z.object({
  name: z.string().regex(/^[A-Z][A-Z0-9_]{0,62}$/),
  example: z.string().max(200),
  description: z.string().max(200),
});

export const AdkProjectSchema = z.object({
  /** Python package / folder name. */
  packageName: pyIdent,
  title: z.string().max(80),
  description: z.string().max(600),
  rootAgent: pyIdent,
  agents: z.array(AdkAgentSchema).min(1).max(12),
  tools: z.array(AdkToolSchema).max(16),
  envVars: z.array(AdkEnvVarSchema).max(12),
  /** Validator findings to review before running (never blocking). */
  warnings: z.array(z.string().max(300)).max(30),
});

export type AdkAgentType = (typeof ADK_AGENT_TYPES)[number];
export type AdkBuiltinTool = (typeof ADK_BUILTIN_TOOLS)[number];
export type AdkTool = z.infer<typeof AdkToolSchema>;
export type AdkAgent = z.infer<typeof AdkAgentSchema>;
export type AdkEnvVar = z.infer<typeof AdkEnvVarSchema>;
export type AdkProject = z.infer<typeof AdkProjectSchema>;
