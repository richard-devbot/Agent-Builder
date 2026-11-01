/**
 * kit-advisor Lambda — single-file implementation.
 *
 * POST /kit-advisor — reviews the wizard's selections, answers, and the
 * generated instruction-file draft (e.g. CLAUDE.md) with the AWS Bedrock
 * Converse API, returning refinement suggestions and unanswered questions
 * that matter for the chosen stack.
 *
 * Runtime environment variables:
 *   BEDROCK_MODEL_ID     model or inference-profile id
 *                        (default: us.amazon.nova-pro-v1:0)
 *   BEDROCK_REGION       region for Bedrock calls (default: Lambda's AWS_REGION)
 *   BEDROCK_ENDPOINT_URL optional endpoint override (used by local stub tests)
 *   ALLOWED_ORIGIN       CORS origin (default: *)
 *
 * IAM: the Lambda execution role needs `bedrock:InvokeModel`.
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
import {
  KitAdvisorRequestSchema,
  KitAdvisorResponseSchema,
  type KitAdvisorRequest,
} from "../../contracts/kit-advisor";

/* ── LLM (AWS Bedrock, Converse API) ── */

export interface LlmClient {
  generate(system: string, user: string): Promise<string>;
}

export class BedrockLlm implements LlmClient {
  private client: BedrockRuntimeClient;
  private modelId: string;

  constructor() {
    this.client = new BedrockRuntimeClient({
      region: process.env.BEDROCK_REGION || process.env.AWS_REGION || "us-east-1",
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
        inferenceConfig: { maxTokens: 2048, temperature: 0.2 },
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

export const SYSTEM_PROMPT = `You are a principal engineer reviewing the configuration of an AI development kit before it is generated.

Given the chosen technology stack, project type, wizard answers, and the draft instruction file, respond with a JSON object with EXACTLY these keys and nothing else (no markdown fence, no commentary):
{
  "suggestions": [{ "title": "<short imperative title>", "detail": "<1-3 sentences, concrete and specific to this stack>", "severity": "info" | "recommended" | "important" }],
  "missingAnswers": ["<questions the user left unanswered that materially affect the kit>"]
}

Rules: at most 8 suggestions; only stack-relevant, actionable items (no generic platitudes); empty arrays are fine when the configuration is already solid.`;

export function buildUserPrompt(input: KitAdvisorRequest): string {
  const parts = [
    `Technology stack: ${input.technologies.join(", ") || "(unspecified)"}`,
  ];
  if (input.projectType) parts.push(`Project type: ${input.projectType}`);
  if (input.answers && Object.keys(input.answers).length > 0) {
    parts.push(``, `Wizard answers:`);
    for (const [k, v] of Object.entries(input.answers)) {
      parts.push(`- ${k}: ${v}`);
    }
  }
  parts.push(``, `Draft instruction file:`, ``, `<draft>`, input.draftMarkdown, `</draft>`);
  return parts.join("\n");
}

/* ── Model output parsing ── */

const FENCE = /^```(?:json)?\n([\s\S]*?)\n```$/;

export function parseAdvice(raw: string) {
  let text = raw.trim();
  const fenced = text.match(FENCE);
  if (fenced) text = fenced[1].trim();

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Model output is not valid JSON");
  }
  const parsed = KitAdvisorResponseSchema.shape.advice.safeParse(data);
  if (!parsed.success) {
    throw new Error("Model output does not match the advice schema");
  }
  return parsed.data;
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
      parsed = KitAdvisorRequestSchema.safeParse(JSON.parse(event.body ?? ""));
    } catch {
      return respond(400, { error: "Invalid JSON body" });
    }
    if (!parsed.success) {
      return respond(400, { error: "Invalid input", details: parsed.error.issues });
    }

    try {
      const raw = await llm.generate(SYSTEM_PROMPT, buildUserPrompt(parsed.data));
      const advice = parseAdvice(raw);
      return respond(200, { advice });
    } catch (err) {
      console.error("kit-advisor failed", err);
      return respond(502, { error: "Kit review failed" });
    }
  };
}

export const handler = createHandler(new BedrockLlm());
