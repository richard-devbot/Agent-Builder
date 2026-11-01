/**
 * author-skill Lambda — single-file implementation.
 *
 * POST /author-skill — AI-authors a SKILL.md from an uploaded reference
 * document + the wizard's tech selections, using the AWS Bedrock Converse
 * API. Deployed via GitHub Actions (.github/workflows/deploy-lambda.yml);
 * the site stays static.
 *
 * Runtime environment variables:
 *   BEDROCK_MODEL_ID     model or inference-profile id
 *                        (default: us.amazon.nova-pro-v1:0)
 *   BEDROCK_REGION       region for Bedrock calls (default: Lambda's AWS_REGION)
 *   BEDROCK_ENDPOINT_URL optional endpoint override (used by local stub tests)
 *   ALLOWED_ORIGIN       CORS origin (default: *)
 *
 * IAM: the Lambda execution role needs `bedrock:InvokeModel` on the model /
 * inference profile — no API keys.
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { AuthorSkillRequestSchema } from "../../contracts/author-skill";

/* ── LLM (AWS Bedrock, Converse API) ── */

export interface LlmClient {
  /** Send a single-turn prompt and return the raw model text. */
  generate(system: string, user: string): Promise<string>;
}

export class BedrockLlm implements LlmClient {
  private client: BedrockRuntimeClient;
  private modelId: string;

  constructor() {
    this.client = new BedrockRuntimeClient({
      region: process.env.BEDROCK_REGION || process.env.AWS_REGION || "us-east-1",
      // Endpoint override (local stub tests) — plain HTTP/1.1 handler, since
      // the default HTTP/2 handler requires a TLS Bedrock endpoint.
      ...(process.env.BEDROCK_ENDPOINT_URL
        ? {
            endpoint: process.env.BEDROCK_ENDPOINT_URL,
            requestHandler: new NodeHttpHandler(),
          }
        : {}),
    });
    this.modelId =
      process.env.BEDROCK_MODEL_ID ?? "us.amazon.nova-pro-v1:0";
  }

  async generate(system: string, user: string): Promise<string> {
    const res = await this.client.send(
      new ConverseCommand({
        modelId: this.modelId,
        system: [{ text: system }],
        messages: [{ role: "user", content: [{ text: user }] }],
        inferenceConfig: { maxTokens: 4096, temperature: 0.3 },
      }),
    );
    const text = res.output?.message?.content
      ?.map((b) => ("text" in b ? b.text : ""))
      .join("");
    if (!text) throw new Error("Model returned no text");
    return text;
  }
}

/* ── Prompt construction ── */

export const SYSTEM_PROMPT = `You are a senior engineer authoring a reusable agent skill (SKILL.md) for an AI coding assistant (Claude Code / GitHub Copilot / Cursor).

A skill is a focused, step-by-step capability the agent invokes when relevant. Good skills:
- have ONE clear purpose stated in the description
- give concrete, imperative steps and checklists, not vague advice
- encode the team's conventions found in the reference document
- include a "when to use" trigger and a definition of done

Respond with ONLY the SKILL.md content, starting with YAML frontmatter:
---
name: <kebab-case-name>
description: <one sentence: what it does and when to use it>
---
followed by the markdown body. No commentary before or after.`;

export type AuthorSkillInput = {
  technologies: string[];
  projectName?: string;
  notes?: string;
  document: { name: string; text: string };
};

export function buildUserPrompt(input: AuthorSkillInput): string {
  const parts = [
    `Author a SKILL.md tailored to this project.`,
    ``,
    `Technology stack: ${input.technologies.join(", ") || "(unspecified)"}`,
  ];
  if (input.projectName) parts.push(`Project: ${input.projectName}`);
  if (input.notes) parts.push(`Project notes: ${input.notes}`);
  parts.push(
    ``,
    `Reference document ("${input.document.name}") — extract the conventions, workflows, and domain rules from it into the skill:`,
    ``,
    `<document>`,
    input.document.text,
    `</document>`,
  );
  return parts.join("\n");
}

/* ── Model output parsing ── */

export type AuthoredSkill = {
  /** kebab-case skill name from frontmatter. */
  name: string;
  /** One-line description from frontmatter. */
  description: string;
  /** Full SKILL.md content (frontmatter + body). */
  markdown: string;
};

const FENCE = /^```(?:markdown|md)?\n([\s\S]*?)\n```$/;

export function parseSkillMarkdown(raw: string): AuthoredSkill {
  let text = raw.trim();
  const fenced = text.match(FENCE);
  if (fenced) text = fenced[1].trim();

  const fm = text.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) throw new Error("Model output missing YAML frontmatter");

  const name = fm[1].match(/^name:\s*(.+)$/m)?.[1]?.trim();
  const description = fm[1].match(/^description:\s*(.+)$/m)?.[1]?.trim();
  if (!name || !description) {
    throw new Error("Frontmatter missing name or description");
  }

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) throw new Error("Skill name produced an empty slug");

  return { name: slug, description, markdown: text };
}

/* ── Lambda handler ── */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN ?? "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

function respond(status: number, body: unknown): APIGatewayProxyResultV2 {
  return { statusCode: status, headers: CORS_HEADERS, body: JSON.stringify(body) };
}

export function createHandler(llm: LlmClient) {
  return async (
    event: APIGatewayProxyEventV2,
  ): Promise<APIGatewayProxyResultV2> => {
    if (event.requestContext.http.method === "OPTIONS") {
      return respond(204, {});
    }
    if (event.requestContext.http.method !== "POST") {
      return respond(405, { error: "Method not allowed" });
    }

    let parsed;
    try {
      parsed = AuthorSkillRequestSchema.safeParse(JSON.parse(event.body ?? ""));
    } catch {
      return respond(400, { error: "Invalid JSON body" });
    }
    if (!parsed.success) {
      return respond(400, { error: "Invalid input", details: parsed.error.issues });
    }

    try {
      const raw = await llm.generate(SYSTEM_PROMPT, buildUserPrompt(parsed.data));
      const skill = parseSkillMarkdown(raw);
      return respond(200, { skill });
    } catch (err) {
      console.error("author-skill failed", err);
      return respond(502, { error: "Skill generation failed" });
    }
  };
}

export const handler = createHandler(new BedrockLlm());
