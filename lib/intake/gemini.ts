/**
 * Server-only Gemini access via Google Cloud Vertex AI (or Gemini API key) for
 * the Discovery agent. Import from route handlers only: it reads configuration
 * from `lib/config/server.ts`.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { GoogleGenAI } from "@google/genai";
import { OAuth2Client } from "google-auth-library";
import { z } from "zod";
import type { IntakeStatus } from "@/contracts/intake";
import { loadVertexAiServerConfig } from "@/lib/config/server";
import { INSTRUCTIONS_VERSION } from "./instructions";

const CLOUD_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

function defaultAdcPath(): string {
  if (process.platform === "win32") {
    return join(
      process.env.APPDATA || join(homedir(), "AppData", "Roaming"),
      "gcloud",
      "application_default_credentials.json",
    );
  }
  return join(homedir(), ".config", "gcloud", "application_default_credentials.json");
}

function isCloudRuntime(): boolean {
  return Boolean(
    process.env.K_SERVICE ||
      process.env.KUBERNETES_SERVICE_HOST ||
      process.env.GOOGLE_CLOUD_RUN_JOB ||
      process.env.GAE_SERVICE,
  );
}

let cachedGcloudToken: { token: string; expiresAt: number } | null = null;
function tryGcloudAccessToken(): string | undefined {
  if (cachedGcloudToken && Date.now() < cachedGcloudToken.expiresAt) {
    return cachedGcloudToken.token;
  }
  const candidates = [
    "gcloud",
    "/opt/homebrew/bin/gcloud",
    "/opt/homebrew/share/google-cloud-sdk/bin/gcloud",
    "/usr/local/bin/gcloud",
    join(homedir(), "google-cloud-sdk", "bin", "gcloud"),
  ];
  for (const bin of candidates) {
    if (bin !== "gcloud" && !existsSync(bin)) continue;
    try {
      const out = execFileSync(bin, ["auth", "print-access-token"], {
        encoding: "utf8",
        timeout: 2_500,
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (out && out.length > 20 && !out.includes(" ")) {
        cachedGcloudToken = { token: out, expiresAt: Date.now() + 10 * 60_000 };
        return out;
      }
    } catch {
      // try next candidate
    }
  }
  return undefined;
}

function detectVertexCredentials(cfg: ReturnType<typeof loadVertexAiServerConfig>): {
  available: boolean;
  mode: "service-account" | "adc" | "none";
  token?: string;
} {
  if (cfg.serviceAccountJson) {
    return { available: true, mode: "service-account" };
  }
  const envCredPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (envCredPath && existsSync(envCredPath)) {
    return { available: true, mode: "service-account" };
  }
  if (cfg.accessToken) {
    return { available: true, mode: "adc", token: cfg.accessToken };
  }
  if (existsSync(defaultAdcPath()) || isCloudRuntime()) {
    return { available: true, mode: "adc" };
  }
  const cliToken = tryGcloudAccessToken();
  if (cliToken) {
    return { available: true, mode: "adc", token: cliToken };
  }
  return { available: false, mode: "none" };
}

export function intakeStatus(): IntakeStatus {
  const cfg = loadVertexAiServerConfig();
  const base = { model: cfg.model, instructionsVersion: INSTRUCTIONS_VERSION };
  if (cfg.apiKey) {
    return {
      ...base,
      configured: true,
      provider: cfg.useVertex ? "vertex-ai" : "gemini-api",
      auth: cfg.useVertex ? "express" : "api-key",
    };
  }
  if (cfg.useVertex) {
    const creds = detectVertexCredentials(cfg);
    if (!creds.available) {
      return {
        ...base,
        configured: true,
        provider: "vertex-ai",
        auth: "none",
        authError: `GCP project "${cfg.project}" is configured in .env.local, but no local Google Cloud credentials were found. Run "gcloud auth application-default login", or set GEMINI_API_KEY or GOOGLE_SERVICE_ACCOUNT_JSON in .env.local.`,
      };
    }
    return {
      ...base,
      configured: true,
      provider: "vertex-ai",
      auth: creds.mode === "service-account" ? "service-account" : "adc",
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

function buildGenAiClient(locationOverride?: string): GoogleGenAI {
  const cfg = loadVertexAiServerConfig();
  if (cfg.apiKey && !cfg.useVertex) {
    return new GoogleGenAI({ apiKey: cfg.apiKey });
  }
  if (cfg.apiKey && cfg.useVertex) {
    return new GoogleGenAI({
      vertexai: true,
      apiKey: cfg.apiKey,
    });
  }
  const creds = detectVertexCredentials(cfg);
  if (!creds.available) {
    throw new IntakeModelError(
      `Google Cloud project "${cfg.project}" is configured in .env.local, but no authentication credentials were found on this machine. Run "gcloud auth application-default login" in your terminal, or add GEMINI_API_KEY=... or GOOGLE_SERVICE_ACCOUNT_JSON='{...}' to .env.local.`,
    );
  }
  if (creds.token) {
    const oauthClient = new OAuth2Client();
    oauthClient.setCredentials({ access_token: creds.token });
    return new GoogleGenAI({
      vertexai: true,
      project: cfg.project,
      location: locationOverride || cfg.location,
      googleAuthOptions: {
        scopes: [CLOUD_SCOPE],
        authClient: oauthClient,
      },
    });
  }
  return new GoogleGenAI({
    vertexai: true,
    project: cfg.project,
    location: locationOverride || cfg.location,
    googleAuthOptions: { scopes: [CLOUD_SCOPE], credentials: serviceAccount() },
  });
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
      if (e instanceof IntakeModelError) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      if (/could not load the default credentials|unauthenticated|invalid_grant/i.test(msg)) {
        const cfg = loadVertexAiServerConfig();
        throw new IntakeModelError(
          `Google Cloud authentication failed for project "${cfg.project}". Run "gcloud auth application-default login", or set GEMINI_API_KEY or GOOGLE_SERVICE_ACCOUNT_JSON in .env.local.`,
        );
      }
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

let resolvedTarget: { model: string; location: string } | null = null;

/** One structured call: system + user prompt in, Zod-validated object out. */
export async function generateStructured<T>(
  schema: z.ZodType<T>,
  system: string,
  user: string,
  maxOutputTokens = 8192,
  timeoutMs = 45_000,
): Promise<T> {
  const cfg = loadVertexAiServerConfig();
  const candidates: { model: string; location: string }[] = [];
  const pushCandidate = (model: string, location: string) => {
    if (!candidates.some((c) => c.model === model && c.location === location)) {
      candidates.push({ model, location });
    }
  };
  if (resolvedTarget) {
    pushCandidate(resolvedTarget.model, resolvedTarget.location);
  }
  pushCandidate(cfg.model, cfg.location);
  if (cfg.location !== "global") {
    pushCandidate(cfg.model, "global");
  }
  for (const fbModel of cfg.fallbackModels) {
    pushCandidate(fbModel, "global");
    pushCandidate(fbModel, cfg.location);
  }

  const jsonSchema = toGeminiSchema(z.toJSONSchema(schema));
  let lastErr: unknown;

  for (const target of candidates) {
    try {
      const ai = buildGenAiClient(target.location);
      const res = await callModel(
        () =>
          ai.models.generateContent({
            model: target.model,
            contents: [{ role: "user", parts: [{ text: user }] }],
            config: {
              systemInstruction: system,
              temperature: 0.3,
              maxOutputTokens,
              responseMimeType: "application/json",
              responseJsonSchema: jsonSchema,
              abortSignal: AbortSignal.timeout(timeoutMs),
            },
          }),
        timeoutMs,
      );
      resolvedTarget = target;
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
    } catch (e) {
      lastErr = e;
      const status = statusOf(e);
      const msg = e instanceof Error ? e.message : String(e);
      const isModelNotFound =
        status === 404 ||
        status === 400 ||
        /not\s+found|publisher\s+model|was\s+not\s+found|not\s+supported/i.test(msg);
      if (isModelNotFound) {
        continue;
      }
      throw e;
    }
  }

  throw lastErr instanceof Error
    ? lastErr
    : new IntakeModelError("Failed to generate structured response from Gemini.");
}
