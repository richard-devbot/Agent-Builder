/**
 * Server-only Gemini access via Google Cloud Vertex AI for the Discovery agent.
 * Import from route handlers only: it reads Vertex AI configuration from
 * `lib/config/server.ts`.
 *
 * Authentication is strictly Vertex AI OAuth 2.0 (ADC, Workload Identity
 * Federation, or `GOOGLE_SERVICE_ACCOUNT_JSON`). API keys are not used.
 */

import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { IntakeStatus } from "@/contracts/intake";
import { loadVertexAiServerConfig } from "@/lib/config/server";
import { INSTRUCTIONS_VERSION } from "./instructions";

const CLOUD_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

export function intakeStatus(): IntakeStatus {
  const cfg = loadVertexAiServerConfig();
  const base = { model: cfg.model, instructionsVersion: INSTRUCTIONS_VERSION };
  if (cfg.configured) {
    return {
      ...base,
      configured: true,
      provider: "vertex-ai",
      auth: cfg.serviceAccountJson ? "service-account" : "adc",
    };
  }
  return { ...base, configured: false, provider: "none", auth: "none" };
}

function serviceAccount(): Record<string, unknown> | undefined {
  const { serviceAccountJson } = loadVertexAiServerConfig();
  if (!serviceAccountJson) return undefined;
  try {
    return JSON.parse(serviceAccountJson) as Record<string, unknown>;
  } catch {
    throw new IntakeModelError("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON");
  }
}

let client: GoogleGenAI | null = null;
function genai(): GoogleGenAI {
  if (client) return client;
  const cfg = loadVertexAiServerConfig();
  client = new GoogleGenAI({
    vertexai: true,
    project: cfg.project,
    location: cfg.location,
    googleAuthOptions: { scopes: [CLOUD_SCOPE], credentials: serviceAccount() },
  });
  return client;
}

/**
 * Gemini's structured output accepts a subset of JSON Schema. Keep the
 * structural keywords and drop validation-only ones; Zod re-validates the
 * response, so nothing is lost.
 */
const KEEP = new Set([
  "type",
  "properties",
  "required",
  "items",
  "enum",
  "description",
  "minItems",
  "maxItems",
  "anyOf",
]);
export function toGeminiSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toGeminiSchema);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    if (!KEEP.has(k)) continue;
    out[k] =
      k === "properties"
        ? Object.fromEntries(
            Object.entries(v as object).map(([p, s]) => [p, toGeminiSchema(s)]),
          )
        : toGeminiSchema(v);
  }
  return out;
}

export class IntakeModelError extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const statusOf = (e: unknown) =>
  typeof e === "object" && e && "status" in e
    ? Number((e as { status: unknown }).status)
    : 0;

async function callModel<T>(attempt: () => Promise<T>, timeoutMs: number): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await attempt();
    } catch (e) {
      const status = statusOf(e);
      const retryable = status === 429 || status === 503;
      if (retryable && i === 0) {
        await sleep(status === 429 ? 4_000 : 1_500);
        continue;
      }
      if (status === 429)
        throw new IntakeModelError(
          "Vertex AI quota is temporarily exhausted. Wait a moment, then try again.",
        );
      if (status === 503)
        throw new IntakeModelError(
          "Vertex AI is temporarily overloaded. Try again in a moment.",
        );
      if (
        e instanceof Error &&
        (e.name === "AbortError" ||
          e.name === "TimeoutError" ||
          /aborted/i.test(e.message))
      ) {
        throw new IntakeModelError(
          `The model didn't answer within ${Math.round(timeoutMs / 1000)} seconds. Try again.`,
        );
      }
      throw e;
    }
  }
}

/** One structured call: system + user prompt in, Zod-validated object out. */
export async function generateStructured<T>(
  schema: z.ZodType<T>,
  system: string,
  user: string,
  maxOutputTokens = 8192,
  timeoutMs = 45_000,
): Promise<T> {
  const { model } = loadVertexAiServerConfig();
  const res = await callModel(
    () =>
      genai().models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: user }] }],
        config: {
          systemInstruction: system,
          temperature: 0.4,
          maxOutputTokens,
          responseMimeType: "application/json",
          responseJsonSchema: toGeminiSchema(z.toJSONSchema(schema)),
          abortSignal: AbortSignal.timeout(timeoutMs),
        },
      }),
    timeoutMs,
  );
  const text = res.text;
  if (!text) throw new IntakeModelError("The model returned no content");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new IntakeModelError("The model returned malformed JSON");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success)
    throw new IntakeModelError(
      `The model response did not match the schema: ${parsed.error.issues[0]?.message}`,
    );
  return parsed.data;
}
