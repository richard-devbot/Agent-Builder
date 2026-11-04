/**
 * Public / client-safe configuration loaded from environment variables and
 * validated with Zod. Centralises all model IDs, regions, GCP environment
 * metadata, GitLab group metadata, org names, support links, owner-team
 * contacts, and compliance options.
 */

import { z } from "zod";

export const ApprovedModelSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  note: z.string().default(""),
  recommended: z.boolean().optional(),
});

export type ApprovedModel = z.infer<typeof ApprovedModelSchema>;

export const RegionOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
});

export type RegionOption = z.infer<typeof RegionOptionSchema>;

export const ComplianceOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
});

export type ComplianceOption = z.infer<typeof ComplianceOptionSchema>;

export const DeployTargetSchema = z.enum([
  "agent_engine",
  "cloud_run",
  "gemini_enterprise",
]);

export type DeployTarget = z.infer<typeof DeployTargetSchema>;

export const DeployEnvironmentIdSchema = z.enum(["dev", "uat", "prod"]);
export type DeployEnvironmentId = z.infer<typeof DeployEnvironmentIdSchema>;

export const GcpEnvironmentConfigSchema = z.object({
  id: DeployEnvironmentIdSchema,
  label: z.string().min(1),
  gcpProjectId: z.string(),
  region: z.string(),
  runtimeServiceAccount: z.string(),
  defaultDeployTarget: DeployTargetSchema,
  requiresApproverRole: z.boolean(),
});

export type GcpEnvironmentConfig = z.infer<typeof GcpEnvironmentConfigSchema>;

const DEFAULT_APPROVED_MODELS: ApprovedModel[] = [
  {
    id: "gemini-3.8-flash",
    label: "gemini-3.8-flash",
    note: "Default · multi-step orchestration and tool use",
    recommended: true,
  },
  {
    id: "gemini-3.5-flash",
    label: "gemini-3.5-flash",
    note: "Balanced quality and speed",
  },
  {
    id: "gemini-3.5-flash-lite",
    label: "gemini-3.5-flash-lite",
    note: "Fastest and lowest latency · simple extraction",
  },
  {
    id: "gemini-3.1-flash-lite",
    label: "gemini-3.1-flash-lite",
    note: "Previous lite generation",
  },
  {
    id: "gemini-2.5-flash",
    label: "gemini-2.5-flash",
    note: "Recommended for fast tool-calling workflows",
  },
  {
    id: "gemini-2.5-pro",
    label: "gemini-2.5-pro",
    note: "Complex reasoning and multi-agent planning",
  },
];

const DEFAULT_REGIONS: RegionOption[] = [
  { id: "global", label: "Global (Vertex AI)" },
  { id: "us-central1", label: "North America — Iowa (us-central1)" },
  { id: "us-east4", label: "North America — Virginia (us-east4)" },
  { id: "europe-west1", label: "Europe — Belgium (europe-west1)" },
  { id: "europe-west4", label: "Europe — Netherlands (europe-west4)" },
  { id: "asia-southeast1", label: "Asia Pacific — Singapore (asia-southeast1)" },
];

const DEFAULT_COMPLIANCE_OPTIONS: ComplianceOption[] = [
  { id: "soc2", label: "SOC 2 / ISO 27001" },
  { id: "gdpr", label: "GDPR / personal data (PII)" },
  { id: "hipaa", label: "HIPAA / health data" },
  { id: "pci", label: "PCI-DSS / payment data" },
  { id: "fedramp", label: "Government / FedRAMP" },
  { id: "internal-only", label: "Internal policy only" },
];

const DEFAULT_OWNER_TEAM_CONTACTS: Record<string, string> = {
  sharepoint: "Collaboration & Microsoft 365 Platform Team (request via IT Service Portal)",
  servicenow: "Enterprise Service Management Team (request via IT Service Portal)",
  salesforce: "CRM Platform Operations Team (request via Business Systems Queue)",
  workday: "HR Technology & People Systems Team (request via HRIS Access Workflow)",
  sap: "ERP Integration & Basis Team (request via Enterprise Systems Ticket)",
  jira: "Engineering Productivity & Atlassian Admin Team (request via DevTools Queue)",
  confluence: "Engineering Productivity & Atlassian Admin Team (request via DevTools Queue)",
  bigquery: "Cloud Data Platform Team (request via Data Governance Catalog)",
  database: "Database Reliability Engineering Team (request via DBA Access Ticket)",
  email: "Messaging & Exchange Platform Team (request via IT Service Portal)",
  teams: "Collaboration & Microsoft 365 Platform Team (request via IT Service Portal)",
  default: "System Owner Team (submit an access request in the IT Service Portal)",
};

function parseJsonOrFallback<T>(raw: string | undefined, schema: z.ZodType<T>, fallback: T): T {
  if (!raw?.trim()) return fallback;
  try {
    const parsed = JSON.parse(raw);
    const res = schema.safeParse(parsed);
    return res.success ? res.data : fallback;
  } catch {
    return fallback;
  }
}

export const StrictPublicEnvSchema = z.object({
  NEXT_PUBLIC_APP_NAME: z.string().min(1, "NEXT_PUBLIC_APP_NAME is required"),
  NEXT_PUBLIC_ORG_NAME: z.string().min(1, "NEXT_PUBLIC_ORG_NAME is required"),
  NEXT_PUBLIC_SITE_URL: z.string().url("NEXT_PUBLIC_SITE_URL must be a valid URL"),
  NEXT_PUBLIC_GITLAB_BASE_URL: z.string().url("NEXT_PUBLIC_GITLAB_BASE_URL must be a valid URL"),
  NEXT_PUBLIC_GITLAB_GROUP_PATH: z.string().min(1, "NEXT_PUBLIC_GITLAB_GROUP_PATH is required"),
  NEXT_PUBLIC_GITLAB_GROUP_OWNER_CONTACT: z.string().min(1, "NEXT_PUBLIC_GITLAB_GROUP_OWNER_CONTACT is required"),
  NEXT_PUBLIC_SUPPORT_URL: z.string().url("NEXT_PUBLIC_SUPPORT_URL must be a valid URL"),
  NEXT_PUBLIC_TICKET_SYSTEM_URL: z.string().url("NEXT_PUBLIC_TICKET_SYSTEM_URL must be a valid URL"),
  NEXT_PUBLIC_GCP_DEV_PROJECT_ID: z.string().min(1, "NEXT_PUBLIC_GCP_DEV_PROJECT_ID is required"),
  NEXT_PUBLIC_GCP_DEV_REGION: z.string().min(1, "NEXT_PUBLIC_GCP_DEV_REGION is required"),
  NEXT_PUBLIC_GCP_DEV_RUNTIME_SA: z.string().min(1, "NEXT_PUBLIC_GCP_DEV_RUNTIME_SA is required"),
  NEXT_PUBLIC_GCP_UAT_PROJECT_ID: z.string().min(1, "NEXT_PUBLIC_GCP_UAT_PROJECT_ID is required"),
  NEXT_PUBLIC_GCP_UAT_REGION: z.string().min(1, "NEXT_PUBLIC_GCP_UAT_REGION is required"),
  NEXT_PUBLIC_GCP_UAT_RUNTIME_SA: z.string().min(1, "NEXT_PUBLIC_GCP_UAT_RUNTIME_SA is required"),
  NEXT_PUBLIC_GCP_PROD_PROJECT_ID: z.string().min(1, "NEXT_PUBLIC_GCP_PROD_PROJECT_ID is required"),
  NEXT_PUBLIC_GCP_PROD_REGION: z.string().min(1, "NEXT_PUBLIC_GCP_PROD_REGION is required"),
  NEXT_PUBLIC_GCP_PROD_RUNTIME_SA: z.string().min(1, "NEXT_PUBLIC_GCP_PROD_RUNTIME_SA is required"),
});

/**
 * Validates that every required public environment variable is set.
 * Fails fast with a readable error listing all missing variables.
 */
export function validatePublicEnv(env: Record<string, string | undefined> = process.env) {
  const result = StrictPublicEnvSchema.safeParse(env);
  if (!result.success) {
    const lines = result.error.issues.map(
      (issue) => `  - ${issue.path.join(".")}: ${issue.message}`,
    );
    throw new Error(
      `Missing or invalid public environment configuration:\n${lines.join("\n")}\nSee .env.example for required variables.`,
    );
  }
  return result.data;
}

export interface PublicConfig {
  appName: string;
  appEdition: string;
  orgName: string;
  siteUrl: string;
  gitlabBaseUrl: string;
  gitlabGroupPath: string;
  gitlabGroupOwnerContact: string;
  supportUrl: string;
  ticketSystemUrl: string;
  ownerTeamContacts: Record<string, string>;
  regions: RegionOption[];
  approvedModels: ApprovedModel[];
  defaultAdkModel: string;
  complianceOptions: ComplianceOption[];
  environments: Record<DeployEnvironmentId, GcpEnvironmentConfig>;
}

/**
 * Next.js only inlines literal `process.env.NEXT_PUBLIC_*` expressions into the
 * client bundle (it does not populate `process.env` as a dynamic dictionary on
 * the client). Building this default dictionary from explicit literal property
 * reads guarantees server SSR and client hydration see the exact same values.
 */
const INLINED_PUBLIC_ENV: Record<string, string | undefined> = {
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  NEXT_PUBLIC_APP_EDITION: process.env.NEXT_PUBLIC_APP_EDITION,
  NEXT_PUBLIC_ORG_NAME: process.env.NEXT_PUBLIC_ORG_NAME,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_GITLAB_BASE_URL: process.env.NEXT_PUBLIC_GITLAB_BASE_URL,
  NEXT_PUBLIC_GITLAB_GROUP_PATH: process.env.NEXT_PUBLIC_GITLAB_GROUP_PATH,
  NEXT_PUBLIC_GITLAB_GROUP_OWNER_CONTACT: process.env.NEXT_PUBLIC_GITLAB_GROUP_OWNER_CONTACT,
  NEXT_PUBLIC_SUPPORT_URL: process.env.NEXT_PUBLIC_SUPPORT_URL,
  NEXT_PUBLIC_TICKET_SYSTEM_URL: process.env.NEXT_PUBLIC_TICKET_SYSTEM_URL,
  NEXT_PUBLIC_APPROVED_GEMINI_MODELS: process.env.NEXT_PUBLIC_APPROVED_GEMINI_MODELS,
  NEXT_PUBLIC_DEFAULT_GEMINI_MODEL: process.env.NEXT_PUBLIC_DEFAULT_GEMINI_MODEL,
  NEXT_PUBLIC_GCP_REGIONS: process.env.NEXT_PUBLIC_GCP_REGIONS,
  NEXT_PUBLIC_COMPLIANCE_OPTIONS: process.env.NEXT_PUBLIC_COMPLIANCE_OPTIONS,
  NEXT_PUBLIC_OWNER_TEAM_CONTACTS: process.env.NEXT_PUBLIC_OWNER_TEAM_CONTACTS,
  NEXT_PUBLIC_GCP_DEV_PROJECT_ID: process.env.NEXT_PUBLIC_GCP_DEV_PROJECT_ID,
  NEXT_PUBLIC_GCP_DEV_REGION: process.env.NEXT_PUBLIC_GCP_DEV_REGION,
  NEXT_PUBLIC_GCP_DEV_RUNTIME_SA: process.env.NEXT_PUBLIC_GCP_DEV_RUNTIME_SA,
  NEXT_PUBLIC_GCP_DEV_DEFAULT_TARGET: process.env.NEXT_PUBLIC_GCP_DEV_DEFAULT_TARGET,
  NEXT_PUBLIC_GCP_UAT_PROJECT_ID: process.env.NEXT_PUBLIC_GCP_UAT_PROJECT_ID,
  NEXT_PUBLIC_GCP_UAT_REGION: process.env.NEXT_PUBLIC_GCP_UAT_REGION,
  NEXT_PUBLIC_GCP_UAT_RUNTIME_SA: process.env.NEXT_PUBLIC_GCP_UAT_RUNTIME_SA,
  NEXT_PUBLIC_GCP_UAT_DEFAULT_TARGET: process.env.NEXT_PUBLIC_GCP_UAT_DEFAULT_TARGET,
  NEXT_PUBLIC_GCP_PROD_PROJECT_ID: process.env.NEXT_PUBLIC_GCP_PROD_PROJECT_ID,
  NEXT_PUBLIC_GCP_PROD_REGION: process.env.NEXT_PUBLIC_GCP_PROD_REGION,
  NEXT_PUBLIC_GCP_PROD_RUNTIME_SA: process.env.NEXT_PUBLIC_GCP_PROD_RUNTIME_SA,
  NEXT_PUBLIC_GCP_PROD_DEFAULT_TARGET: process.env.NEXT_PUBLIC_GCP_PROD_DEFAULT_TARGET,
};

export function loadPublicConfig(
  env: Record<string, string | undefined> = INLINED_PUBLIC_ENV,
): PublicConfig {
  const approvedModels = parseJsonOrFallback(
    env.NEXT_PUBLIC_APPROVED_GEMINI_MODELS,
    z.array(ApprovedModelSchema).min(1),
    DEFAULT_APPROVED_MODELS,
  );
  const regions = parseJsonOrFallback(
    env.NEXT_PUBLIC_GCP_REGIONS,
    z.array(RegionOptionSchema).min(1),
    DEFAULT_REGIONS,
  );
  const complianceOptions = parseJsonOrFallback(
    env.NEXT_PUBLIC_COMPLIANCE_OPTIONS,
    z.array(ComplianceOptionSchema).min(1),
    DEFAULT_COMPLIANCE_OPTIONS,
  );
  const ownerTeamContacts = parseJsonOrFallback(
    env.NEXT_PUBLIC_OWNER_TEAM_CONTACTS,
    z.record(z.string(), z.string()),
    DEFAULT_OWNER_TEAM_CONTACTS,
  );
  const defaultAdkModel =
    env.NEXT_PUBLIC_DEFAULT_GEMINI_MODEL?.trim() || approvedModels[0].id;

  const defaultTarget = (
    raw: string | undefined,
    fallback: DeployTarget = "agent_engine",
  ): DeployTarget => {
    const parsed = DeployTargetSchema.safeParse(raw?.trim());
    return parsed.success ? parsed.data : fallback;
  };

  return {
    appName: env.NEXT_PUBLIC_APP_NAME?.trim() || "Agent Builder",
    appEdition: env.NEXT_PUBLIC_APP_EDITION?.trim() || "Enterprise Platform",
    orgName: env.NEXT_PUBLIC_ORG_NAME?.trim() || "",
    siteUrl: (env.NEXT_PUBLIC_SITE_URL || env.SITE_URL || "http://localhost:3000")
      .trim()
      .replace(/\/$/, ""),
    gitlabBaseUrl: (env.NEXT_PUBLIC_GITLAB_BASE_URL || "").trim().replace(/\/$/, ""),
    gitlabGroupPath: (env.NEXT_PUBLIC_GITLAB_GROUP_PATH || "").trim().replace(/^\/+|\/+$/g, ""),
    gitlabGroupOwnerContact:
      env.NEXT_PUBLIC_GITLAB_GROUP_OWNER_CONTACT?.trim() || "your GitLab group administrator",
    supportUrl: env.NEXT_PUBLIC_SUPPORT_URL?.trim() || "",
    ticketSystemUrl: env.NEXT_PUBLIC_TICKET_SYSTEM_URL?.trim() || "",
    ownerTeamContacts,
    regions,
    approvedModels,
    defaultAdkModel,
    complianceOptions,
    environments: {
      dev: {
        id: "dev",
        label: "Development (dev)",
        gcpProjectId: env.NEXT_PUBLIC_GCP_DEV_PROJECT_ID?.trim() || "",
        region: env.NEXT_PUBLIC_GCP_DEV_REGION?.trim() || "",
        runtimeServiceAccount: env.NEXT_PUBLIC_GCP_DEV_RUNTIME_SA?.trim() || "",
        defaultDeployTarget: defaultTarget(env.NEXT_PUBLIC_GCP_DEV_DEFAULT_TARGET, "agent_engine"),
        requiresApproverRole: false,
      },
      uat: {
        id: "uat",
        label: "User Acceptance Testing (uat)",
        gcpProjectId: env.NEXT_PUBLIC_GCP_UAT_PROJECT_ID?.trim() || "",
        region: env.NEXT_PUBLIC_GCP_UAT_REGION?.trim() || "",
        runtimeServiceAccount: env.NEXT_PUBLIC_GCP_UAT_RUNTIME_SA?.trim() || "",
        defaultDeployTarget: defaultTarget(env.NEXT_PUBLIC_GCP_UAT_DEFAULT_TARGET, "agent_engine"),
        requiresApproverRole: false,
      },
      prod: {
        id: "prod",
        label: "Production (prod)",
        gcpProjectId: env.NEXT_PUBLIC_GCP_PROD_PROJECT_ID?.trim() || "",
        region: env.NEXT_PUBLIC_GCP_PROD_REGION?.trim() || "",
        runtimeServiceAccount: env.NEXT_PUBLIC_GCP_PROD_RUNTIME_SA?.trim() || "",
        defaultDeployTarget: defaultTarget(env.NEXT_PUBLIC_GCP_PROD_DEFAULT_TARGET, "agent_engine"),
        requiresApproverRole: true,
      },
    },
  };
}

export const publicConfig: PublicConfig = loadPublicConfig();
export const APPROVED_GEMINI_MODELS: readonly ApprovedModel[] = publicConfig.approvedModels;
export const DEFAULT_GEMINI_MODEL: string = publicConfig.defaultAdkModel;
export const GCP_REGIONS: readonly RegionOption[] = publicConfig.regions;
export const COMPLIANCE_OPTIONS: readonly ComplianceOption[] = publicConfig.complianceOptions;
