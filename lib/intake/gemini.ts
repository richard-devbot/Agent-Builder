/**
 * Server-only Gemini access for the Discovery agent. Import from route
 * handlers only: it reads credentials from the environment.
 *
 * Vertex AI over OAuth 2.0 (recommended; GOOGLE_GENAI_USE_VERTEXAI=true):
 *   GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_LOCATION (default us-central1), and one of
 *   - GOOGLE_SERVICE_ACCOUNT_JSON  service-account key JSON (e.g. an Azure Key
 *                                  Vault reference); exchanged for OAuth tokens
 *   - Application Default Credentials: `gcloud auth application-default login`
 *     locally, GOOGLE_APPLICATION_CREDENTIALS, or workload identity federation
 *     (an external-account JSON, which lets Azure call Google without a key)
 * Gemini API (key, no OAuth): GEMINI_API_KEY or GOOGLE_API_KEY
 * Model: GEMINI_MODEL (default gemini-2.5-flash)
 */

import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { IntakeStatus } from "@/contracts/intake";
import { INSTRUCTIONS_VERSION } from "./instructions";

const MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
const CLOUD_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

export function intakeStatus(): IntakeStatus {
  const base = { model: MODEL, instructionsVersion: INSTRUCTIONS_VERSION };
  if (process.env.GOOGLE_GENAI_USE_VERTEXAI === "true" && process.env.GOOGLE_CLOUD_PROJECT) {
    return { ...base, configured: true, provider: "vertex-ai", auth: process.env.GOOGLE_SERVICE_ACCOUNT_JSON ? "service-account" : "adc" };
  }
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
    return { ...base, configured: true, provider: "gemini-api", auth: "api-key" };
  }
  return { ...base, configured: false, provider: "none", auth: "none" };
}

function serviceAccount(): Record<string, unknown> | undefined {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new IntakeModelError("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON");
  }
}

let client: GoogleGenAI | null = null;
function genai(): GoogleGenAI {
  if (client) return client;
  const status = intakeStatus();
  client =
    status.provider === "vertex-ai"
      ? new GoogleGenAI({
          vertexai: true,
          project: process.env.GOOGLE_CLOUD_PROJECT,
          location: process.env.GOOGLE_CLOUD_LOCATION || "us-central1",
          // Without inline credentials google-auth-library falls back to ADC.
          googleAuthOptions: { scopes: [CLOUD_SCOPE], credentials: serviceAccount() },
        })
      : new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY });
  return client;
}

/**
 * Gemini's structured output accepts a subset of JSON Schema. Keep the
 * structural keywords and drop validation-only ones; Zod re-validates the
 * response, so nothing is lost.
 */
const KEEP = new Set(["type", "properties", "required", "items", "enum", "description", "minItems", "maxItems", "anyOf"]);
export function toGeminiSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toGeminiSchema);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    if (!KEEP.has(k)) continue;
    out[k] = k === "properties" ? Object.fromEntries(Object.entries(v as object).map(([p, s]) => [p, toGeminiSchema(s)])) : toGeminiSchema(v);
  }
  return out;
}

export class IntakeModelError extends Error {}

/** One structured call: system + user prompt in, Zod-validated object out. */
export async function generateStructured<T>(schema: z.ZodType<T>, system: string, user: string, maxOutputTokens = 8192): Promise<T> {
  const res = await genai().models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: user }] }],
    config: {
      systemInstruction: system,
      temperature: 0.4,
      maxOutputTokens,
      responseMimeType: "application/json",
      responseJsonSchema: toGeminiSchema(z.toJSONSchema(schema)),
    },
  });
  const text = res.text;
  if (!text) throw new IntakeModelError("The model returned no content");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new IntakeModelError("The model returned malformed JSON");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new IntakeModelError(`The model response did not match the schema: ${parsed.error.issues[0]?.message}`);
  return parsed.data;
}
