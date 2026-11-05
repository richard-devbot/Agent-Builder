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

/** Trigger / entrypoint modes for an ADK flow. */
export const ADK_TRIGGER_TYPES = [
  "chat_a2a",
  "pubsub",
  "eventarc",
  "schedule",
  "webhook",
] as const;

/** Tool kinds supported in the visual ADK Studio. */
export const ADK_TOOL_KINDS = [
  "builtin",
  "function",
  "mcp",
  "vertex_rag",
  "connector",
] as const;

/** Authentication patterns for enterprise tools & connections. */
export const ADK_AUTH_TYPES = [
  "adc_wif",
  "secret_manager",
  "oauth_user_consent",
  "service_account",
  "none",
] as const;

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
  kind: z.enum(ADK_TOOL_KINDS),
  description: z.string().max(400),
  builtin: z.enum(ADK_BUILTIN_TOOLS).optional(),
  /** Complete Python `def` for function/connector/mcp/rag tools; its docstring is what the model sees. */
  code: z.string().max(8_000).optional(),
  /** Extra import lines the function needs. */
  imports: z.array(z.string().max(200)).max(12),
  /** Extra pip packages the function needs. */
  dependencies: z.array(z.string().max(80)).max(12),
  /** MCP server slug or URL when kind === "mcp". */
  mcpServer: z.string().max(200).optional(),
  /** Vertex AI Search data store env var when kind === "vertex_rag". */
  ragDataStoreId: z.string().max(120).optional(),
  /** Enterprise system name when kind === "connector" (e.g. SAP, ServiceNow, Jira). */
  connectorSystem: z.string().max(120).optional(),
  /** Authentication method used at runtime. */
  authType: z.enum(ADK_AUTH_TYPES).optional(),
  /** Require human-in-the-loop confirmation before executing this tool. */
  requireConfirmation: z.boolean().optional(),
  /** Environment variable keys read by this tool. */
  envVars: z.array(z.string().max(64)).max(12).optional(),
});

export const AdkAgentSchema = z.object({
  name: pyIdent,
  type: z.enum(ADK_AGENT_TYPES),
  description: z.string().max(400),
  /** LlmAgent only. */
  model: z.string().max(80).optional(),
  instruction: z.string().max(6_000).optional(),
  /** CrewAI-style structured persona & task fields (compiled into instruction/metadata). */
  role: z.string().max(200).optional(),
  goal: z.string().max(400).optional(),
  backstory: z.string().max(1_000).optional(),
  expectedOutput: z.string().max(400).optional(),
  /** Conditional flow routing expression / branch label (ADK 2.0 Workflow route). */
  routeCondition: z.string().max(160).optional(),
  /** Pause for human approval before running or delegating from this agent. */
  requireConfirmation: z.boolean().optional(),
  /** Attached reusable skill slugs (SKILL.md). */
  skills: z.array(z.string().max(80)).max(12).optional(),
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
  /** True when the variable is a secret stored in GCP Secret Manager / GitLab Protected CI. */
  isSecret: z.boolean().optional(),
  /** Secret Manager secret identifier (e.g. sap-oauth-client-secret:latest). */
  secretRef: z.string().max(160).optional(),
  /** System or tool that consumes this variable. */
  boundTo: z.string().max(120).optional(),
  /** Runtime authentication/injection mechanism. */
  authMode: z.enum(ADK_AUTH_TYPES).optional(),
});

export const AdkTriggerSchema = z.object({
  kind: z.enum(ADK_TRIGGER_TYPES),
  scheduleCron: z.string().max(80).optional(),
  eventTopic: z.string().max(160).optional(),
  inputSchemaSummary: z.string().max(300).optional(),
});

export const AdkEvalCaseSchema = z.object({
  id: z.string().max(64),
  prompt: z.string().max(2_000),
  expectedTools: z.array(z.string().max(64)).max(12),
  expectedOutcome: z.string().max(1_000),
});

export const AdkProjectSchema = z.object({
  /** Python package / folder name. */
  packageName: pyIdent,
  title: z.string().max(80),
  description: z.string().max(600),
  rootAgent: pyIdent,
  trigger: AdkTriggerSchema.optional(),
  agents: z.array(AdkAgentSchema).min(1).max(12),
  tools: z.array(AdkToolSchema).max(16),
  envVars: z.array(AdkEnvVarSchema).max(24),
  evalCases: z.array(AdkEvalCaseSchema).max(16).optional(),
  /** Validator findings to review before running (never blocking). */
  warnings: z.array(z.string().max(300)).max(30),
});

export type AdkAgentType = (typeof ADK_AGENT_TYPES)[number];
export type AdkTriggerType = (typeof ADK_TRIGGER_TYPES)[number];
export type AdkToolKind = (typeof ADK_TOOL_KINDS)[number];
export type AdkAuthType = (typeof ADK_AUTH_TYPES)[number];
export type AdkBuiltinTool = (typeof ADK_BUILTIN_TOOLS)[number];
export type AdkTool = z.infer<typeof AdkToolSchema>;
export type AdkAgent = z.infer<typeof AdkAgentSchema>;
export type AdkEnvVar = z.infer<typeof AdkEnvVarSchema>;
export type AdkTrigger = z.infer<typeof AdkTriggerSchema>;
export type AdkEvalCase = z.infer<typeof AdkEvalCaseSchema>;
export type AdkProject = z.infer<typeof AdkProjectSchema>;
