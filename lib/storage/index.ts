/**
 * Client-side localStorage persistence layer (`lib/storage/`).
 * All browser state (Kit Studio state, Deployment Setup, Push results, and the
 * Deployment Registry) is read and written exclusively through this module.
 * Secrets and OAuth tokens are NEVER stored here.
 */

import { z } from "zod";
import { DeployEnvironmentIdSchema, DeployTargetSchema, type DeployEnvironmentId, type DeployTarget } from "@/lib/config/public";

const KIT_STATE_KEY = "agent-builder-kit-v1";
const DEPLOYMENT_SETUP_KEY = "agent-builder-deployment-setup-v1";
const LAST_PUSH_KEY = "agent-builder-last-push-v1";
const DEPLOYMENT_REGISTRY_KEY = "agent-builder-deployment-registry-v1";

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function readStorageJson<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeStorageJson(key: string, value: unknown): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Best-effort persistence when storage quota is exceeded
  }
}

export function removeStorageKey(key: string): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage removal errors
  }
}

export function loadKitStudioSnapshot<T>(): T | null {
  return readStorageJson<T | null>(KIT_STATE_KEY, null);
}

export function saveKitStudioSnapshot(snapshot: unknown): void {
  writeStorageJson(KIT_STATE_KEY, snapshot);
}

export interface DeploymentSetupState {
  gitlabGroupPath: string;
  gitlabProjectSlug: string;
  agentFolderName: string;
  environment: DeployEnvironmentId | "";
  deployTarget: DeployTarget;
  gcpProjectId: string;
  gcpProjectNumber: string;
  gcpRegion: string;
  wifPoolId: string;
  wifProviderId: string;
  deployerServiceAccount: string;
  runtimeServiceAccount: string;
  agentDisplayName: string;
  agentDescription: string;
  geminiEnterpriseAppId: string;
  geminiEnterpriseLocation: "global" | "us" | "eu";
}

export const DEFAULT_DEPLOYMENT_SETUP: DeploymentSetupState = {
  gitlabGroupPath: "",
  gitlabProjectSlug: "",
  agentFolderName: "",
  environment: "",
  deployTarget: "agent_engine",
  gcpProjectId: "",
  gcpProjectNumber: "",
  gcpRegion: "",
  wifPoolId: "",
  wifProviderId: "",
  deployerServiceAccount: "",
  runtimeServiceAccount: "",
  agentDisplayName: "",
  agentDescription: "",
  geminiEnterpriseAppId: "",
  geminiEnterpriseLocation: "global",
};

export function loadDeploymentSetup(): DeploymentSetupState {
  return {
    ...DEFAULT_DEPLOYMENT_SETUP,
    ...readStorageJson<Partial<DeploymentSetupState>>(DEPLOYMENT_SETUP_KEY, {}),
  };
}

export function saveDeploymentSetup(state: DeploymentSetupState): void {
  writeStorageJson(DEPLOYMENT_SETUP_KEY, state);
}

export interface GitLabPushRecord {
  projectId: number;
  projectPath: string;
  projectUrl: string;
  commitSha: string;
  branch: string;
  mergeRequestUrl?: string;
  pipelineUrl?: string;
  pushedAt: string;
}

export function loadLastPushRecord(): GitLabPushRecord | null {
  return readStorageJson<GitLabPushRecord | null>(LAST_PUSH_KEY, null);
}

export function saveLastPushRecord(record: GitLabPushRecord): void {
  writeStorageJson(LAST_PUSH_KEY, record);
}

export const REASONING_ENGINE_RESOURCE_ID_REGEX = /^\d{19}$/;

export const DeploymentRecordSchema = z
  .object({
    target: DeployTargetSchema,
    environment: DeployEnvironmentIdSchema.or(z.string().min(1)),
    displayName: z.string().min(1),
    gcpProject: z.string().min(1),
    commitSha: z.string().optional().nullable(),
    tag: z.string().optional().nullable(),
    pipelineUrl: z.string().optional().nullable(),
    deployedBy: z.string().optional().nullable(),
    deployedAt: z.string().min(1),
    kitVersion: z.string().optional().nullable(),
    resourceName: z.string().optional(),
    projectNumber: z.string().optional(),
    location: z.string().optional(),
    resourceId: z.string().optional(),
    service: z.string().optional(),
    url: z.string().optional(),
    geminiEnterpriseAgent: z.string().optional().nullable(),
  })
  .superRefine((val, ctx) => {
    if (val.target === "agent_engine" || val.target === "gemini_enterprise") {
      if (!val.resourceId || !REASONING_ENGINE_RESOURCE_ID_REGEX.test(val.resourceId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["resourceId"],
          message:
            "Agent Engine deployments must include a 19-digit numeric reasoningEngines RESOURCE_ID.",
        });
      }
    }
  });

export type DeploymentRecord = z.infer<typeof DeploymentRecordSchema>;

export function loadDeploymentRegistry(): DeploymentRecord[] {
  return readStorageJson<DeploymentRecord[]>(DEPLOYMENT_REGISTRY_KEY, []);
}

export function saveDeploymentRecordToRegistry(rawRecord: unknown): DeploymentRecord {
  const validated = DeploymentRecordSchema.parse(rawRecord);
  const existing = loadDeploymentRegistry();
  const deduped = existing.filter(
    (r) =>
      !(
        r.displayName === validated.displayName &&
        r.environment === validated.environment &&
        r.tag === validated.tag &&
        r.deployedAt === validated.deployedAt
      ),
  );
  const updated = [validated, ...deduped];
  writeStorageJson(DEPLOYMENT_REGISTRY_KEY, updated);
  return validated;
}
