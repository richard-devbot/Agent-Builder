/**
 * Shared request/response contract for the Discovery intake agent.
 *
 * Imported by BOTH sides of the wire so they cannot drift:
 *   - UI:     components/kit-builder/intake/* via lib/intake/client.ts
 *   - Server: app/api/intake/{followup,plan}/route.ts
 *
 * Every array and string is capped so a request can't grow without bound.
 */

import { z } from "zod";
import { AdkProjectSchema } from "./adk";

export const IntakeRoleSchema = z.enum(["developer", "business", "manager"]);

const line = z.string().max(600);
const list = (max = 12) => z.array(line).max(max);

export const RequiredValueSchema = z.object({
  name: z.string().max(120),
  isSecret: z.boolean(),
  whereToGet: z.string().max(300),
  whoProvides: z.string().max(200),
  howToRequest: z.string().max(400),
});

export const SystemAccessModeSchema = z.enum(["read", "write"]);
export const SystemConnectionStatusSchema = z.enum(["known", "needs_request", "unknown"]);

export const DiscoverySystemSchema = z.object({
  name: z.string().max(120),
  purpose: z.string().max(500),
  dataAccessed: z.string().max(500),
  access: SystemAccessModeSchema,
  dataClassification: z.string().max(200),
  ownerTeam: z.string().max(200),
  connectionMethod: z.string().max(300),
  requiredValues: z.array(RequiredValueSchema).max(12),
  storageLocation: z.string().max(300),
  status: SystemConnectionStatusSchema,
});

export const AccessRequestSchema = z.object({
  item: z.string().max(300),
  ownerTeam: z.string().max(200),
  suggestedWording: z.string().max(600),
});

export const RiskTierSchema = z.enum(["low", "medium", "high"]);

/** The living discovery brief the follow-up agent fills in. */
export const BriefSchema = z.object({
  title: z.string().max(120),
  summary: z.string().max(1_200),
  problem: z.string().max(2_000),
  goals: list(),
  users: list(),
  inScope: list(),
  outOfScope: list(),
  stack: list(20),
  integrations: list(),
  dataCompliance: z.string().max(1_200),
  constraints: list(),
  timeline: z.string().max(300),
  successMetrics: list(),
  risks: list(),
  openQuestions: list(15),
  /** Defaults the agent proposed when the requester didn't know ("Assumed: …"). */
  assumptions: list(),
  /** Phase F — Internal business team discovery brief extensions */
  audience: z.string().max(300).default(""),
  riskTier: RiskTierSchema.default("low"),
  riskReason: z.string().max(400).default(""),
  systems: z.array(DiscoverySystemSchema).max(16).default([]),
  accessRequests: z.array(AccessRequestSchema).max(16).default([]),
  nextSteps: list(10).default([]),
});

export const DiscoveryBriefSchema = BriefSchema;

export const BRIEF_FIELDS = [
  "problem",
  "goals",
  "users",
  "inScope",
  "outOfScope",
  "stack",
  "integrations",
  "dataCompliance",
  "constraints",
  "timeline",
  "successMetrics",
  "risks",
] as const;
export const BriefFieldSchema = z.enum(BRIEF_FIELDS);

export const MaterialSchema = z.object({
  id: z.string().max(64),
  name: z.string().max(200),
  kind: z.enum(["file", "link", "note", "repo"]),
  /** Extracted text, already truncated client-side. */
  text: z.string().max(30_000),
});

export const FollowUpQuestionSchema = z.object({
  id: z.string().max(64),
  field: BriefFieldSchema,
  question: z.string().max(400),
  /** One line on why the answer matters — shown under the question. */
  why: z.string().max(300),
  suggestions: z.array(z.string().max(120)).max(6),
  multi: z.boolean(),
});

export const AnswerSchema = z.object({
  questionId: z.string().max(64),
  field: BriefFieldSchema,
  question: z.string().max(400),
  answer: z.string().max(2_000),
});

/** Recent chat turns, so the agent can follow the conversation. */
export const TurnSchema = z.object({
  role: z.enum(["user", "agent"]),
  text: z.string().max(2_000),
});

export const IntakeContextSchema = z.object({
  role: IntakeRoleSchema,
  brief: BriefSchema,
  materials: z.array(MaterialSchema).max(12),
  /** Every answer given so far, oldest first. */
  answers: z.array(AnswerSchema).max(80),
  /** Ids of questions already asked, so the agent never repeats one. */
  asked: z.array(z.string().max(64)).max(120),
  transcript: z.array(TurnSchema).max(24),
});

export const FollowUpRequestSchema = IntakeContextSchema.extend({
  round: z.number().int().min(0).max(40),
  /** Free-form message typed this turn (may be empty when only answering questions). */
  message: z.string().max(4_000),
});

export const FollowUpResponseSchema = z.object({
  brief: BriefSchema,
  questions: z.array(FollowUpQuestionSchema).max(6),
  /** The agent's reply for this turn, shown as a chat bubble. */
  message: z.string().max(2_000),
  done: z.boolean(),
  mode: z.enum(["ai", "guided"]),
});

const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{1,47}$/);

export const CustomAgentSchema = z.object({
  name: slug,
  title: z.string().max(80),
  description: z.string().max(300),
  tools: z.array(z.string().max(40)).max(10),
  /** Other custom agents this one hands work to (graph edges). */
  handoffsTo: z.array(slug).max(4),
  /** Custom skills this agent relies on (graph edges). */
  skills: z.array(slug).max(4),
  /** Markdown system prompt, no frontmatter. */
  body: z.string().max(8_000),
});

export const CustomSkillSchema = z.object({
  name: slug,
  title: z.string().max(80),
  description: z.string().max(400),
  /** SKILL.md markdown body, no frontmatter. */
  body: z.string().max(10_000),
});

/** Catalog skill reference returned with a plan; the client resolves it against the catalog. */
export const SkillRecommendationSchema = z.object({
  need: z.string().max(200),
  skillIds: z.array(z.string().max(200)).max(3),
});

export const PlanSchema = z.object({
  summary: z.string().max(1_500),
  projectType: z.enum(["greenfield", "brownfield", "legacy-migration", "none"]),
  /** Technology ids from lib/kit/technologies.ts (validated server-side). */
  technologies: z.array(z.string().max(60)).max(20),
  milestones: z.array(z.object({ title: z.string().max(120), detail: z.string().max(400) })).max(8),
  skills: z.array(SkillRecommendationSchema).max(8),
  customAgents: z.array(CustomAgentSchema).max(4),
  customSkills: z.array(CustomSkillSchema).max(4),
  /** The runnable Google ADK agent system that solves the problem (null in guided mode without a brief). */
  adk: AdkProjectSchema.nullable(),
});

export const PlanRequestSchema = IntakeContextSchema;

export const PlanResponseSchema = z.object({
  plan: PlanSchema,
  mode: z.enum(["ai", "guided"]),
});

export const MaterialInsightSchema = z.object({
  materialId: z.string().max(64),
  summary: z.string().max(600),
  facts: z.array(z.string().max(300)).max(6),
  technologies: z.array(z.string().max(60)).max(12),
  gaps: z.array(z.string().max(300)).max(3),
});

export const AnalyzeRequestSchema = z.object({
  role: IntakeRoleSchema,
  brief: BriefSchema,
  /** Every material; `analyze` lists the ids to read this time. */
  materials: z.array(MaterialSchema).max(12),
  analyze: z.array(z.string().max(64)).min(1).max(12),
});

export const AnalyzeResponseSchema = z.object({
  insights: z.array(MaterialInsightSchema).max(12),
  brief: BriefSchema,
  message: z.string().max(2_000),
  mode: z.enum(["ai", "guided"]),
});

export const IntakeStatusSchema = z.object({
  configured: z.boolean(),
  provider: z.enum(["gemini-api", "vertex-ai", "none"]),
  /** How the server authenticates to Google: API key, or OAuth via a service account or ADC. */
  auth: z.enum(["api-key", "express", "service-account", "adc", "none"]),
  model: z.string(),
  instructionsVersion: z.string(),
});

export type IntakeRole = z.infer<typeof IntakeRoleSchema>;
export type RequiredValue = z.infer<typeof RequiredValueSchema>;
export type DiscoverySystem = z.infer<typeof DiscoverySystemSchema>;
export type AccessRequest = z.infer<typeof AccessRequestSchema>;
export type RiskTier = z.infer<typeof RiskTierSchema>;
export type Brief = z.infer<typeof BriefSchema>;
export type DiscoveryBrief = Brief;
export type BriefField = z.infer<typeof BriefFieldSchema>;
export type Material = z.infer<typeof MaterialSchema>;
export type FollowUpQuestion = z.infer<typeof FollowUpQuestionSchema>;
export type Answer = z.infer<typeof AnswerSchema>;
export type IntakeContext = z.infer<typeof IntakeContextSchema>;
export type FollowUpRequest = z.infer<typeof FollowUpRequestSchema>;
export type FollowUpResponse = z.infer<typeof FollowUpResponseSchema>;
export type CustomAgent = z.infer<typeof CustomAgentSchema>;
export type CustomSkill = z.infer<typeof CustomSkillSchema>;
export type Plan = z.infer<typeof PlanSchema>;
export type PlanResponse = z.infer<typeof PlanResponseSchema>;
export type IntakeStatus = z.infer<typeof IntakeStatusSchema>;
export type Turn = z.infer<typeof TurnSchema>;
export type MaterialInsight = z.infer<typeof MaterialInsightSchema>;
export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;
export type AnalyzeResponse = z.infer<typeof AnalyzeResponseSchema>;
