/**
 * Server-only Gemini access for the Discovery agent. Import from route
 * handlers only: it reads credentials from the environment.
 *
 * Vertex AI over OAuth 2.0 (GOOGLE_GENAI_USE_VERTEXAI=true + GOOGLE_CLOUD_PROJECT):
 *   GOOGLE_CLOUD_LOCATION (default global), and one of
 *   - GOOGLE_SERVICE_ACCOUNT_JSON  service-account key JSON (e.g. an Azure Key
 *                                  Vault reference); exchanged for OAuth tokens
 *   - Application Default Credentials: `gcloud auth application-default login`
 *     locally, GOOGLE_APPLICATION_CREDENTIALS, or workload identity federation
 * Vertex AI express mode (GOOGLE_GENAI_USE_VERTEXAI=true + GOOGLE_API_KEY, no project):
 *   a Google Cloud API key (starts "AQ."), e.g. from the free trial. Keys in
 *   that format are treated as express-mode keys even without the flag.
 * Gemini API (AI Studio key, starts "AIza"): GEMINI_API_KEY or GOOGLE_API_KEY
 * Model: GEMINI_MODEL (default gemini-3.8-flash)
 */

import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { IntakeStatus } from "@/contracts/intake";
import { INSTRUCTIONS_VERSION } from "./instructions";

const MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash";
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION?.trim() || "global";
const CLOUD_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

const apiKey = () => process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || "";
/** Google Cloud API keys (express mode) start "AQ."; AI Studio keys start "AIza". */
const expressKey = () => process.env.GOOGLE_GENAI_USE_VERTEXAI === "true" || apiKey().startsWith("AQ.");

export function intakeStatus(): IntakeStatus {
  const base = { model: MODEL, instructionsVersion: INSTRUCTIONS_VERSION };
  if (process.env.GOOGLE_GENAI_USE_VERTEXAI === "true" && process.env.GOOGLE_CLOUD_PROJECT) {
    return { ...base, configured: true, provider: "vertex-ai", auth: process.env.GOOGLE_SERVICE_ACCOUNT_JSON ? "service-account" : "adc" };
  }
  if (apiKey()) {
    return expressKey()
      ? { ...base, configured: true, provider: "vertex-ai", auth: "express" }
      : { ...base, configured: true, provider: "gemini-api", auth: "api-key" };
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
  const { auth } = intakeStatus();
  client =
    auth === "service-account" || auth === "adc"
      ? new GoogleGenAI({
          vertexai: true,
          project: process.env.GOOGLE_CLOUD_PROJECT,
          location: LOCATION,
          // Without inline credentials google-auth-library falls back to ADC.
          googleAuthOptions: { scopes: [CLOUD_SCOPE], credentials: serviceAccount() },
        })
      : auth === "express"
        ? new GoogleGenAI({ vertexai: true, apiKey: apiKey(), location: LOCATION })
        : new GoogleGenAI({ apiKey: apiKey() });
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const statusOf = (e: unknown) => (typeof e === "object" && e && "status" in e ? Number((e as { status: unknown }).status) : 0);

/**
 * Express-mode keys have low per-minute quotas, and calls occasionally stall.
 * Each attempt gets a deadline; quota (429) and overload (503) errors are
 * retried once after a short wait, then reported in plain language.
 */
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
      if (status === 429) throw new IntakeModelError("Gemini's quota for this key is used up for the moment (express-mode keys have low per-minute limits). Wait a minute, then try again.");
      if (status === 503) throw new IntakeModelError("Gemini is overloaded right now. Try again in a moment.");
      if (e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError" || /aborted/i.test(e.message))) {
        throw new IntakeModelError(`The model didn't answer within ${Math.round(timeoutMs / 1000)} seconds. Try again.`);
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
  const res = await callModel(
    () =>
      genai().models.generateContent({
        model: MODEL,
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
  if (!parsed.success) throw new IntakeModelError(`The model response did not match the schema: ${parsed.error.issues[0]?.message}`);
  return parsed.data;
}
