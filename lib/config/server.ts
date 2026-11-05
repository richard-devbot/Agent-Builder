/**
 * Server-only configuration loaded from environment variables and validated
 * with Zod. Fails fast with a readable error listing every missing variable.
 */

import { z } from "zod";
import { DEFAULT_GEMINI_MODEL, loadPublicConfig } from "./public";

export const ServerEnvSchema = z.object({
  AUTH_SECRET: z.string().min(1, "AUTH_SECRET is required"),
  AUTH_MICROSOFT_ENTRA_ID_ID: z.string().min(1, "AUTH_MICROSOFT_ENTRA_ID_ID is required"),
  AUTH_MICROSOFT_ENTRA_ID_SECRET: z.string().min(1, "AUTH_MICROSOFT_ENTRA_ID_SECRET is required"),
  AUTH_MICROSOFT_ENTRA_ID_ISSUER: z
    .string()
    .url("AUTH_MICROSOFT_ENTRA_ID_ISSUER must be a valid Entra v2.0 issuer URL"),
  AUTH_DEV_BYPASS: z.enum(["true", "false"]).optional(),

  GITLAB_BASE_URL: z.string().url("GITLAB_BASE_URL must be a valid URL"),
  GITLAB_GROUP_PATH: z.string().min(1, "GITLAB_GROUP_PATH is required"),
  GITLAB_GROUP_OWNER_CONTACT: z.string().min(1, "GITLAB_GROUP_OWNER_CONTACT is required"),
  GITLAB_OAUTH_CLIENT_ID: z.string().min(1, "GITLAB_OAUTH_CLIENT_ID is required"),
  GITLAB_OAUTH_CLIENT_SECRET: z.string().min(1, "GITLAB_OAUTH_CLIENT_SECRET is required"),
  GITLAB_OAUTH_REDIRECT_URI: z.string().url("GITLAB_OAUTH_REDIRECT_URI must be a valid URL").optional(),
  GITLAB_TOKEN_ENC_KEY: z
    .string()
    .min(32, "GITLAB_TOKEN_ENC_KEY must be at least 32 characters for AES-256-GCM"),

  GOOGLE_GENAI_USE_VERTEXAI: z.literal("true", {
    message: "GOOGLE_GENAI_USE_VERTEXAI must be 'true' (Gemini via Vertex AI only)",
  }),
  GOOGLE_CLOUD_PROJECT: z.string().min(1, "GOOGLE_CLOUD_PROJECT is required for Vertex AI"),
  GOOGLE_CLOUD_LOCATION: z.string().min(1, "GOOGLE_CLOUD_LOCATION is required for Vertex AI"),
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().optional(),
  GEMINI_MODEL: z.string().min(1).optional(),
});

export type ServerConfig = z.infer<typeof ServerEnvSchema>;

/**
 * Validates the complete server environment and throws a readable startup error
 * listing every missing or invalid variable.
 */
export function loadServerConfig(
  env: Record<string, string | undefined> = process.env,
): ServerConfig {
  const result = ServerEnvSchema.safeParse(env);
  if (!result.success) {
    const missing = result.error.issues.map(
      (issue) => `  - ${issue.path.join(".")}: ${issue.message}`,
    );
    throw new Error(
      `Startup configuration error — missing or invalid server environment variables:\n${missing.join("\n")}\nCopy .env.example to .env.local and fill in the required values.`,
    );
  }
  return result.data;
}

const GitLabEnvSliceSchema = ServerEnvSchema.pick({
  GITLAB_BASE_URL: true,
  GITLAB_OAUTH_CLIENT_ID: true,
  GITLAB_OAUTH_CLIENT_SECRET: true,
  GITLAB_OAUTH_REDIRECT_URI: true,
  GITLAB_TOKEN_ENC_KEY: true,
}).extend({
  GITLAB_GROUP_PATH: z.string().optional(),
});

export function loadGitLabServerConfig(
  env: Record<string, string | undefined> = process.env,
) {
  const pub = loadPublicConfig(env);
  const candidate = {
    ...env,
    GITLAB_BASE_URL: env.GITLAB_BASE_URL || pub.gitlabBaseUrl || undefined,
    GITLAB_GROUP_PATH: env.GITLAB_GROUP_PATH || pub.gitlabGroupPath || undefined,
  };
  const result = GitLabEnvSliceSchema.safeParse(candidate);
  if (!result.success) {
    const missing = result.error.issues.map(
      (issue) => `${issue.path.join(".")} (${issue.message})`,
    );
    throw new Error(
      `Missing GitLab server configuration: ${missing.join(", ")}`,
    );
  }
  return {
    baseUrl: result.data.GITLAB_BASE_URL.replace(/\/$/, ""),
    groupPath: (result.data.GITLAB_GROUP_PATH || "").replace(/^\/+|\/+$/g, ""),
    ownerContact:
      env.GITLAB_GROUP_OWNER_CONTACT?.trim() || pub.gitlabGroupOwnerContact,
    clientId: result.data.GITLAB_OAUTH_CLIENT_ID,
    clientSecret: result.data.GITLAB_OAUTH_CLIENT_SECRET,
    redirectUri: result.data.GITLAB_OAUTH_REDIRECT_URI,
    tokenEncKey: result.data.GITLAB_TOKEN_ENC_KEY,
  };
}

export function loadVertexAiServerConfig(
  env: Record<string, string | undefined> = process.env,
) {
  const model = env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  const location = env.GOOGLE_CLOUD_LOCATION?.trim() || "global";
  let saProject = "";
  if (env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()) {
    try {
      const parsed = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON.trim()) as {
        project_id?: string;
      };
      if (parsed && typeof parsed.project_id === "string") {
        saProject = parsed.project_id.trim();
      }
    } catch {
      // handled later if service account JSON is invalid
    }
  }
  const project =
    env.GOOGLE_CLOUD_PROJECT?.trim() ||
    saProject ||
    env.NEXT_PUBLIC_GCP_DEV_PROJECT_ID?.trim() ||
    "";
  const useVertex = env.GOOGLE_GENAI_USE_VERTEXAI === "true" && Boolean(project);
  return {
    configured: useVertex,
    model,
    location,
    project,
    serviceAccountJson: env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim() || undefined,
  };
}
