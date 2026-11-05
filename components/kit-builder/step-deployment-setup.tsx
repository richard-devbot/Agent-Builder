"use client";

/**
 * Step 5 — Deployment Setup.
 *
 * Contains:
 *  a) GitLab connection card: "Connect GitLab" button (OAuth), connected user,
 *     target group (selectable from user's GitLab groups or editable slug, with
 *     admin config default), project name (validated slug), visibility = private.
 *  b) Cloud connection & deploy target configuration card: environment picker
 *     (dev/uat/prod, hiding prod unless user role is Approver/Admin), default
 *     deploy target (agent_engine | cloud_run | gemini_enterprise), editable
 *     GCP + Workload Identity Federation (WIF) parameters, and target-specific
 *     settings (Agent Engine, Cloud Run, Gemini Enterprise) that are automatically
 *     synced to GitLab CI on push & deploy.
 *  c) Readiness list with green/red states: GitLab connected, group configured,
 *     environment selected, agent folder name valid — with plain-language fix
 *     text for each red item.
 */

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cloud,
  Copy,
  ExternalLink,
  GitBranch,
  KeyRound,
  Lock,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Terminal,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { canDeployProd, type AppRole } from "@/lib/auth/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  publicConfig,
  type DeployEnvironmentId,
  type DeployTarget,
} from "@/lib/config/public";
import {
  loadDeploymentSetup,
  saveDeploymentSetup,
  type DeploymentSetupState,
} from "@/lib/storage";
import { cn } from "@/lib/utils";
import { Panel, StepHeader, fieldLabelClass } from "./primitives";
import type { KitBuilderState } from "./use-kit-builder-state";

export const PROJECT_SLUG_REGEX = /^[a-z0-9][a-z0-9-_]{1,62}$/;
export const AGENT_FOLDER_REGEX = /^[a-z][a-z0-9_]{1,62}$/;

export interface GitLabGroupOption {
  id: number;
  name: string;
  fullPath: string;
}

export interface GitLabConnectionStatus {
  connected: boolean;
  authMode?: "oauth" | "pat_cookie" | "pat_env";
  hasEnvToken?: boolean;
  user?: {
    id: number;
    username: string;
    name: string;
  };
  groups?: GitLabGroupOption[];
  baseUrl?: string;
  groupPath?: string;
  ownerContact?: string;
  expiresAt?: number;
}

export function buildCiVariablesFromSetup(
  setup: DeploymentSetupState,
): Record<string, string> {
  const envCfg = setup.environment
    ? publicConfig.environments[setup.environment]
    : undefined;
  const gcpProjectId =
    setup.gcpProjectId.trim() || envCfg?.gcpProjectId || "";
  const gcpRegion =
    setup.gcpRegion.trim() ||
    envCfg?.region ||
    publicConfig.regions[0]?.id ||
    "";
  const runtimeSa =
    setup.runtimeServiceAccount.trim() || envCfg?.runtimeServiceAccount || "";

  const vars: Record<string, string> = {};
  if (gcpProjectId) vars.GCP_PROJECT_ID = gcpProjectId;
  if (setup.gcpProjectNumber.trim()) {
    vars.GCP_PROJECT_NUMBER = setup.gcpProjectNumber.trim();
  }
  if (gcpRegion) vars.GCP_LOCATION = gcpRegion;
  if (setup.wifPoolId.trim()) vars.WIF_POOL_ID = setup.wifPoolId.trim();
  if (setup.wifProviderId.trim()) {
    vars.WIF_PROVIDER_ID = setup.wifProviderId.trim();
  }
  if (setup.deployerServiceAccount.trim()) {
    vars.DEPLOYER_SA = setup.deployerServiceAccount.trim();
  }
  if (runtimeSa) vars.RUNTIME_SA = runtimeSa;
  if (setup.agentDisplayName.trim()) {
    vars.AGENT_DISPLAY_NAME = setup.agentDisplayName.trim();
  }
  if (setup.agentDescription.trim()) {
    vars.AGENT_DESCRIPTION = setup.agentDescription.trim();
  }
  if (setup.geminiEnterpriseAppId.trim()) {
    vars.GE_APP_ID = setup.geminiEnterpriseAppId.trim();
  }
  if (setup.geminiEnterpriseLocation) {
    vars.GE_LOCATION = setup.geminiEnterpriseLocation;
  }
  return vars;
}

const DEPLOY_TARGET_OPTIONS: {
  id: DeployTarget;
  label: string;
  description: string;
}[] = [
  {
    id: "agent_engine",
    label: "Agent Engine (Vertex AI)",
    description:
      "Managed Vertex AI Reasoning Engine runtime (`adk deploy agent_engine`).",
  },
  {
    id: "cloud_run",
    label: "Cloud Run",
    description:
      "Internal container service protected by Microsoft Entra ID (`security/entra_auth.py`).",
  },
  {
    id: "gemini_enterprise",
    label: "Gemini Enterprise",
    description:
      "Deploys to Vertex AI Agent Engine and registers the agent in Gemini Enterprise.",
  },
];

export function StepDeploymentSetup({
  s,
  standalone = false,
}: {
  s?: KitBuilderState;
  standalone?: boolean;
}) {
  const [localSetup, setLocalSetup] = useState<DeploymentSetupState>(() =>
    loadDeploymentSetup(),
  );
  const [gitlabStatus, setGitlabStatus] = useState<GitLabConnectionStatus>({
    connected: false,
  });
  const [loadingGitlab, setLoadingGitlab] = useState(true);
  const [userRoles, setUserRoles] = useState<AppRole[]>(["Builder"]);
  const [showBootstrapHelper, setShowBootstrapHelper] = useState(false);
  const [showPatInput, setShowPatInput] = useState(false);
  const [patToken, setPatToken] = useState("");
  const [connectingPat, setConnectingPat] = useState(false);

  const setup = s ? s.deploymentSetup : localSetup;
  const updateSetup = (patch: Partial<DeploymentSetupState>) => {
    if (s) {
      s.updateDeploymentSetup(patch);
    } else {
      setLocalSetup((prev) => {
        const next = { ...prev, ...patch };
        saveDeploymentSetup(next);
        return next;
      });
    }
  };

  async function refreshStatus() {
    setLoadingGitlab(true);
    try {
      const [glRes, authRes] = await Promise.all([
        fetch("/api/gitlab/status", { cache: "no-store" }),
        fetch("/api/auth/session", { cache: "no-store" }),
      ]);
      if (glRes.ok) {
        const data = (await glRes.json()) as GitLabConnectionStatus;
        setGitlabStatus(data);
        const suggestedGroup = data.groupPath || data.groups?.[0]?.fullPath;
        if (suggestedGroup && !setup.gitlabGroupPath.trim()) {
          updateSetup({ gitlabGroupPath: suggestedGroup });
        }
      }
      if (authRes.ok) {
        const sess = (await authRes.json()) as {
          user?: { roles?: AppRole[] };
        } | null;
        if (sess?.user?.roles) {
          setUserRoles(sess.user.roles);
        }
      }
    } catch {
      // Status endpoints unavailable or unauthenticated
    } finally {
      setLoadingGitlab(false);
    }
  }

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/gitlab/status", { cache: "no-store" }),
      fetch("/api/auth/session", { cache: "no-store" }),
    ])
      .then(async ([glRes, authRes]) => {
        if (!active) return;
        if (glRes.ok) {
          const data = (await glRes.json()) as GitLabConnectionStatus;
          setGitlabStatus(data);
          const suggestedGroup = data.groupPath || data.groups?.[0]?.fullPath;
          if (suggestedGroup && !setup.gitlabGroupPath.trim()) {
            updateSetup({ gitlabGroupPath: suggestedGroup });
          }
        }
        if (authRes.ok) {
          const sess = (await authRes.json()) as {
            user?: { roles?: AppRole[] };
          } | null;
          if (sess?.user?.roles) {
            setUserRoles(sess.user.roles);
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingGitlab(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function connectWithPat(useEnvToken = false) {
    if (!useEnvToken && !patToken.trim()) {
      toast.error("Paste a GitLab Personal Access Token (e.g. glpat-...) first.");
      return;
    }
    setConnectingPat(true);
    try {
      const res = await fetch("/api/gitlab/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          useEnvToken ? { useEnvToken: true } : { token: patToken.trim() },
        ),
      });
      const data = (await res.json()) as GitLabConnectionStatus & {
        error?: string;
      };
      if (!res.ok) {
        toast.error(data.error || "Failed to connect with GitLab token.");
        return;
      }
      setGitlabStatus(data);
      setPatToken("");
      setShowPatInput(false);
      const suggestedGroup = data.groupPath || data.groups?.[0]?.fullPath;
      if (suggestedGroup && !setup.gitlabGroupPath.trim()) {
        updateSetup({ gitlabGroupPath: suggestedGroup });
      }
      toast.success(
        data.user
          ? `Connected to GitLab as @${data.user.username} via Personal Access Token.`
          : "Connected to GitLab via Personal Access Token.",
      );
    } catch {
      toast.error("Network error while verifying GitLab Personal Access Token.");
    } finally {
      setConnectingPat(false);
    }
  }

  async function disconnectGitLab() {
    try {
      const res = await fetch("/api/gitlab/disconnect", { method: "POST" });
      if (res.ok) {
        setGitlabStatus((prev) => ({
          ...prev,
          connected: false,
          user: undefined,
          groups: undefined,
        }));
        toast.success(
          "Disconnected from GitLab and cleared encrypted token cookie.",
        );
      }
    } catch {
      toast.error("Could not disconnect from GitLab.");
    }
  }

  const configuredGroupPath =
    gitlabStatus.groupPath || publicConfig.gitlabGroupPath || "";
  const effectiveGroupPath =
    setup.gitlabGroupPath.trim() || configuredGroupPath;
  const gitlabBaseUrl =
    gitlabStatus.baseUrl || publicConfig.gitlabBaseUrl || "";

  const prodAllowed = canDeployProd(userRoles);
  const envList = (["dev", "uat", "prod"] as DeployEnvironmentId[]).filter(
    (envId) => envId !== "prod" || prodAllowed,
  );

  const selectedEnvConfig = setup.environment
    ? publicConfig.environments[setup.environment]
    : null;

  const effectiveGcpProjectId =
    setup.gcpProjectId.trim() || selectedEnvConfig?.gcpProjectId || "";
  const effectiveRegion =
    setup.gcpRegion.trim() ||
    selectedEnvConfig?.region ||
    publicConfig.regions[0]?.id ||
    "";
  const effectiveRuntimeSa =
    setup.runtimeServiceAccount.trim() ||
    selectedEnvConfig?.runtimeServiceAccount ||
    "";

  const projectSlugValid = PROJECT_SLUG_REGEX.test(
    setup.gitlabProjectSlug.trim(),
  );
  const agentFolderValid = AGENT_FOLDER_REGEX.test(
    setup.agentFolderName.trim(),
  );

  const readinessItems = [
    {
      id: "gitlab-connected",
      label: "GitLab connected",
      ok: gitlabStatus.connected,
      okText: gitlabStatus.user
        ? `Connected as @${gitlabStatus.user.username} (${gitlabStatus.user.name}) · ${gitlabStatus.authMode === "oauth" ? "OAuth 2.0" : "Personal Access Token"}`
        : "Connected via OAuth 2.0 / PAT",
      fixText:
        "Connect via OAuth ('Connect GitLab') or paste a GitLab Personal Access Token ('Use Access Token') in the GitLab Connection card.",
    },
    {
      id: "group-configured",
      label: "Target GitLab group configured",
      ok: Boolean(effectiveGroupPath),
      okText: `Target group: ${effectiveGroupPath}`,
      fixText:
        "Select a GitLab group from the dropdown or enter your target GitLab group path (e.g. my-org/ai-agents) in the GitLab Connection card.",
    },
    {
      id: "environment-selected",
      label: "Cloud environment & GCP project configured",
      ok: Boolean(setup.environment && effectiveGcpProjectId),
      okText: `${selectedEnvConfig?.label ?? setup.environment} → GCP project ${effectiveGcpProjectId} (${effectiveRegion})`,
      fixText: !setup.environment
        ? "Select a target cloud environment (dev, uat, or prod) in the Cloud Connection card."
        : "Enter your target GCP Project ID in the Cloud Connection card so the GitLab CI pipeline knows where to deploy.",
    },
    {
      id: "agent-folder-valid",
      label: "Agent folder & project slug valid",
      ok: agentFolderValid && projectSlugValid,
      okText: `GitLab slug '${setup.gitlabProjectSlug.trim()}' · Python package '${setup.agentFolderName.trim()}/'`,
      fixText:
        "Enter a valid GitLab project slug (e.g. my-team-agent) and Python package folder name (lowercase letters, digits, underscores, e.g. my_team_agent).",
    },
  ];

  const allReady = readinessItems.every((item) => item.ok);

  const bootstrapCmd = [
    `GCP_PROJECT_ID="${effectiveGcpProjectId || "<gcp-project-id>"}"`,
    `GCP_LOCATION="${effectiveRegion || "<gcp-region>"}"`,
    `GITLAB_URL="${gitlabBaseUrl || "https://gitlab.com"}"`,
    `GITLAB_GROUP_PATH="${effectiveGroupPath || "<gitlab-group-path>"}"`,
    `WIF_POOL_ID="${setup.wifPoolId.trim() || "gitlab-pool"}"`,
    `WIF_PROVIDER_ID="${setup.wifProviderId.trim() || "gitlab-oidc"}"`,
    `bash deploy/bootstrap_gcp_gitlab.sh`,
  ].join(" \\\n  ");

  return (
    <div className="space-y-5">
      {!standalone && <StepHeader n={5} />}

      <div className="grid grid-cols-1 gap-5 @4xl:grid-cols-2">
        {/* a) GitLab connection card */}
        <Panel
          id="gitlab-connection"
          icon={GitBranch}
          title="GitLab Connection"
          description="Connect via OAuth 2.0 + PKCE or a GitLab Personal Access Token (PAT). Tokens are encrypted in an httpOnly cookie."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={refreshStatus}
                disabled={loadingGitlab}
                aria-label="Refresh GitLab connection status"
              >
                <RefreshCw
                  className={cn("size-3.5", loadingGitlab && "animate-spin")}
                />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowPatInput((v) => !v)}
              >
                <KeyRound className="size-3.5" />
                {gitlabStatus.connected ? "Switch Token" : "Use Access Token"}
              </Button>
              {gitlabStatus.connected ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={disconnectGitLab}
                >
                  <LogOut className="size-3.5" /> Disconnect
                </Button>
              ) : (
                <a
                  href={`/api/gitlab/login?returnTo=${encodeURIComponent(standalone ? "/integrations" : "/studio")}`}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground shadow-xs hover:bg-primary/90"
                >
                  <GitBranch className="size-3.5" /> Connect OAuth
                </a>
              )}
            </div>
          }
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 rounded-lg border bg-muted/25 p-3 text-xs sm:grid-cols-3">
              <div>
                <span className="block text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Connected User
                </span>
                <span className="mt-1 block font-mono font-medium">
                  {gitlabStatus.connected && gitlabStatus.user
                    ? `@${gitlabStatus.user.username}`
                    : "Not connected"}
                </span>
                {gitlabStatus.connected && (
                  <span className="mt-0.5 block text-[10px] text-emerald-500">
                    {gitlabStatus.authMode === "oauth"
                      ? "OAuth 2.0 + PKCE"
                      : gitlabStatus.authMode === "pat_env"
                        ? "PAT (.env.local)"
                        : "Personal Access Token"}
                  </span>
                )}
              </div>
              <div>
                <span className="block text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Target Group
                </span>
                <span
                  className="mt-1 block truncate font-mono font-medium"
                  title={effectiveGroupPath || "Not set"}
                >
                  {effectiveGroupPath || "Select or enter below"}
                </span>
              </div>
              <div>
                <span className="block text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Visibility
                </span>
                <span className="mt-1 inline-flex items-center gap-1 rounded bg-primary/12 px-2 py-0.5 font-mono text-[11px] font-semibold text-primary">
                  <Lock className="size-3" aria-hidden /> private
                </span>
              </div>
            </div>

            {/* Personal Access Token (PAT) Fallback Panel */}
            {(showPatInput || !gitlabStatus.connected) && (
              <div className="rounded-lg border border-primary/25 bg-primary/5 p-3 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <KeyRound className="size-3.5 text-primary" />
                    GitLab Personal Access Token (PAT) Fallback
                  </span>
                  {gitlabBaseUrl && (
                    <a
                      href={`${gitlabBaseUrl}/-/user_settings/personal_access_tokens?name=Agent+Builder&scopes=api,read_user`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                    >
                      Create GitLab token <ExternalLink className="size-3" />
                    </a>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  If GitLab OAuth is unavailable, paste a Personal Access Token (scopes:{" "}
                  <code className="font-mono">api</code>,{" "}
                  <code className="font-mono">read_user</code>) to push repositories, fetch projects, and trigger CI/CD pipelines.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    type="password"
                    value={patToken}
                    onChange={(e) => setPatToken(e.target.value)}
                    placeholder="glpat-..."
                    autoComplete="off"
                    spellCheck={false}
                    className="h-8 flex-1 font-mono text-xs"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => connectWithPat(false)}
                    disabled={connectingPat || !patToken.trim()}
                    className="h-8 text-xs"
                  >
                    {connectingPat ? "Verifying…" : "Connect with Token"}
                  </Button>
                  {gitlabStatus.hasEnvToken && !gitlabStatus.connected && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => connectWithPat(true)}
                      disabled={connectingPat}
                      className="h-8 text-xs"
                    >
                      Use Server Token (.env)
                    </Button>
                  )}
                </div>
              </div>
            )}

            {gitlabBaseUrl && (
              <p className="text-[11px] text-muted-foreground">
                GitLab instance:{" "}
                <code className="font-mono">{gitlabBaseUrl}</code>
              </p>
            )}

            {/* Target GitLab Group selector + text input */}
            <div>
              <label htmlFor="gitlab-group-path" className={fieldLabelClass}>
                Target GitLab group path
              </label>
              {gitlabStatus.groups && gitlabStatus.groups.length > 0 && (
                <select
                  aria-label="Choose from your connected GitLab groups"
                  value={
                    gitlabStatus.groups.some(
                      (g) => g.fullPath === effectiveGroupPath,
                    )
                      ? effectiveGroupPath
                      : ""
                  }
                  onChange={(e) => {
                    if (e.target.value) {
                      updateSetup({ gitlabGroupPath: e.target.value });
                    }
                  }}
                  className="mb-2 h-9 w-full rounded-lg border border-input bg-background px-3 text-xs font-medium"
                >
                  <option value="">
                    — Quick-select from your GitLab groups ({gitlabStatus.groups.length}) —
                  </option>
                  {gitlabStatus.groups.map((g) => (
                    <option key={g.id} value={g.fullPath}>
                      {g.name} ({g.fullPath})
                    </option>
                  ))}
                </select>
              )}
              <Input
                id="gitlab-group-path"
                value={setup.gitlabGroupPath || configuredGroupPath}
                onChange={(e) =>
                  updateSetup({ gitlabGroupPath: e.target.value.trim() })
                }
                placeholder="e.g. my-org/ai-agents"
                autoComplete="off"
                spellCheck={false}
                className="h-9 font-mono text-xs"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                The GitLab group/namespace where your private agent repository will be created.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="gitlab-project-slug" className={fieldLabelClass}>
                  GitLab project name (slug)
                </label>
                <Input
                  id="gitlab-project-slug"
                  value={setup.gitlabProjectSlug}
                  onChange={(e) =>
                    updateSetup({
                      gitlabProjectSlug: e.target.value.toLowerCase(),
                    })
                  }
                  placeholder="e.g. my-team-agent"
                  autoComplete="off"
                  spellCheck={false}
                  className="h-9 font-mono text-xs"
                  aria-invalid={
                    Boolean(setup.gitlabProjectSlug) && !projectSlugValid
                  }
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  2–63 lowercase letters, digits, hyphens or underscores.
                </p>
                {setup.gitlabProjectSlug && !projectSlugValid && (
                  <p className="mt-1 text-xs text-destructive">
                    Project slug must match{" "}
                    <code>^[a-z0-9][a-z0-9-_]&#123;1,62&#125;$</code>.
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="agent-folder-name" className={fieldLabelClass}>
                  Agent Python folder name
                </label>
                <Input
                  id="agent-folder-name"
                  value={setup.agentFolderName}
                  onChange={(e) =>
                    updateSetup({
                      agentFolderName: e.target.value.toLowerCase(),
                    })
                  }
                  placeholder="e.g. my_team_agent"
                  autoComplete="off"
                  spellCheck={false}
                  className="h-9 font-mono text-xs"
                  aria-invalid={
                    Boolean(setup.agentFolderName) && !agentFolderValid
                  }
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Lowercase letters, digits, and underscores only (no hyphens).
                </p>
                {setup.agentFolderName && !agentFolderValid && (
                  <p className="mt-1 text-xs text-destructive">
                    Agent folder name must match{" "}
                    <code>^[a-z][a-z0-9_]&#123;1,62&#125;$</code>.
                  </p>
                )}
              </div>
            </div>
          </div>
        </Panel>

        {/* b) Cloud connection & deploy target configuration card */}
        <Panel
          id="cloud-connection"
          icon={Cloud}
          title="Cloud & Deploy Target Setup"
          description="Enter your target GCP project, keyless Workload Identity Federation (WIF) identifiers, and deploy target settings. These are automatically synced to your GitLab CI project variables on push."
        >
          <div className="space-y-4">
            {/* Environment picker */}
            <div>
              <label htmlFor="cloud-env-picker" className={fieldLabelClass}>
                1. Target environment
              </label>
              <div
                id="cloud-env-picker"
                role="radiogroup"
                aria-label="Target cloud environment"
                className="grid grid-cols-1 gap-2 sm:grid-cols-3"
              >
                {envList.map((envId) => {
                  const envCfg = publicConfig.environments[envId];
                  const active = setup.environment === envId;
                  return (
                    <button
                      key={envId}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() =>
                        updateSetup({
                          environment: envId,
                          deployTarget: envCfg.defaultDeployTarget,
                          gcpProjectId:
                            setup.gcpProjectId || envCfg.gcpProjectId || "",
                          gcpRegion:
                            setup.gcpRegion || envCfg.region || "",
                          runtimeServiceAccount:
                            setup.runtimeServiceAccount ||
                            envCfg.runtimeServiceAccount ||
                            "",
                        })
                      }
                      className={cn(
                        "rounded-lg border p-3 text-left transition-all",
                        active
                          ? "border-primary bg-primary/10 shadow-xs"
                          : "bg-background/60 hover:border-primary/40",
                      )}
                    >
                      <span className="block font-mono text-xs font-bold uppercase">
                        {envId}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">
                        {envCfg.label}
                      </span>
                    </button>
                  );
                })}
              </div>
              {!prodAllowed && (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Note: The <code>prod</code> environment option requires the{" "}
                  <strong>Approver</strong> or <strong>Admin</strong> Entra role.
                </p>
              )}
            </div>

            {/* Default deploy target picker */}
            <div>
              <label htmlFor="deploy-target-select" className={fieldLabelClass}>
                2. Default deploy target
              </label>
              <select
                id="deploy-target-select"
                value={setup.deployTarget}
                onChange={(e) =>
                  updateSetup({ deployTarget: e.target.value as DeployTarget })
                }
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-xs font-medium"
              >
                {DEPLOY_TARGET_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label} — {opt.description}
                  </option>
                ))}
              </select>
            </div>

            {/* Keyless GCP + WIF Connection Inputs */}
            <div className="space-y-3 rounded-lg border bg-muted/20 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-semibold">
                  <KeyRound className="size-3.5 text-primary" aria-hidden />
                  3. GCP &amp; Keyless WIF Connection Details
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() => {
                      const proj = effectiveGcpProjectId.trim();
                      const saDomain = proj
                        ? `${proj}.${"iam"}.${"gserviceaccount"}.com`
                        : "";
                      updateSetup({
                        wifPoolId: setup.wifPoolId.trim() || "gitlab-pool",
                        wifProviderId:
                          setup.wifProviderId.trim() || "gitlab-oidc",
                        deployerServiceAccount:
                          setup.deployerServiceAccount.trim() ||
                          (saDomain
                            ? ["agent-deployer", saDomain].join("@")
                            : ""),
                        runtimeServiceAccount:
                          setup.runtimeServiceAccount.trim() ||
                          (saDomain
                            ? ["agent-runtime", saDomain].join("@")
                            : ""),
                        agentDisplayName:
                          setup.agentDisplayName.trim() ||
                          setup.gitlabProjectSlug.trim() ||
                          "team-agent",
                      });
                      toast.success(
                        proj
                          ? "Filled standard WIF pool, provider, and service account identifiers."
                          : "Filled default WIF pool & provider IDs. Enter your GCP Project ID first to auto-fill service accounts.",
                      );
                    }}
                  >
                    <Sparkles className="size-3 text-primary" /> Auto-Fill Standard Defaults
                  </Button>
                  <span className="rounded bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success">
                    No JSON Keys · OIDC WIF
                  </span>
                </div>
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                GitLab CI authenticates to Google Cloud using Workload Identity Federation (OIDC). Use the quick-links below to grab your Project ID &amp; Project Number from Google Cloud Console, then click <strong>Auto-Fill Standard Defaults</strong>.
              </p>

              {/* Quick-Links to Google Cloud Console */}
              <div className="flex flex-wrap items-center gap-1.5 rounded-md border bg-background/70 px-2.5 py-2 text-[11px]">
                <span className="font-semibold text-muted-foreground">
                  Quick Console Links:
                </span>
                <a
                  href={`https://console.cloud.google.com/home/dashboard${effectiveGcpProjectId ? `?project=${encodeURIComponent(effectiveGcpProjectId)}` : ""}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded border bg-card px-2 py-0.5 font-medium text-primary hover:bg-accent"
                >
                  1. Project ID &amp; Number <ExternalLink className="size-2.5" />
                </a>
                <a
                  href={`https://console.cloud.google.com/iam-admin/workload-identity-pools${effectiveGcpProjectId ? `?project=${encodeURIComponent(effectiveGcpProjectId)}` : ""}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded border bg-card px-2 py-0.5 font-medium text-primary hover:bg-accent"
                >
                  2. WIF Pools <ExternalLink className="size-2.5" />
                </a>
                <a
                  href={`https://console.cloud.google.com/iam-admin/serviceaccounts${effectiveGcpProjectId ? `?project=${encodeURIComponent(effectiveGcpProjectId)}` : ""}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded border bg-card px-2 py-0.5 font-medium text-primary hover:bg-accent"
                >
                  3. Service Accounts <ExternalLink className="size-2.5" />
                </a>
                <a
                  href={
                    setup.deployTarget === "cloud_run"
                      ? `https://console.cloud.google.com/run${effectiveGcpProjectId ? `?project=${encodeURIComponent(effectiveGcpProjectId)}` : ""}`
                      : setup.deployTarget === "gemini_enterprise"
                        ? `https://console.cloud.google.com/gen-app-builder/engines${effectiveGcpProjectId ? `?project=${encodeURIComponent(effectiveGcpProjectId)}` : ""}`
                        : `https://console.cloud.google.com/vertex-ai/agents${effectiveGcpProjectId ? `?project=${encodeURIComponent(effectiveGcpProjectId)}` : ""}`
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded border bg-card px-2 py-0.5 font-medium text-primary hover:bg-accent"
                >
                  4.{" "}
                  {setup.deployTarget === "cloud_run"
                    ? "Cloud Run Console"
                    : setup.deployTarget === "gemini_enterprise"
                      ? "Gemini Enterprise (Get GE_APP_ID)"
                      : "Vertex AI Agent Engine"}{" "}
                  <ExternalLink className="size-2.5" />
                </a>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="gcp-project-id" className={fieldLabelClass}>
                    GCP Project ID (<code>GCP_PROJECT_ID</code>)
                  </label>
                  <Input
                    id="gcp-project-id"
                    value={setup.gcpProjectId || selectedEnvConfig?.gcpProjectId || ""}
                    onChange={(e) => updateSetup({ gcpProjectId: e.target.value })}
                    placeholder="e.g. my-gcp-project-dev"
                    autoComplete="off"
                    spellCheck={false}
                    className="h-8 font-mono text-xs"
                  />
                </div>

                <div>
                  <label htmlFor="gcp-region" className={fieldLabelClass}>
                    GCP Region (<code>GCP_LOCATION</code>)
                  </label>
                  <select
                    id="gcp-region"
                    value={effectiveRegion}
                    onChange={(e) => updateSetup({ gcpRegion: e.target.value })}
                    className="h-8 w-full rounded-lg border border-input bg-background px-2.5 font-mono text-xs"
                  >
                    {publicConfig.regions.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="gcp-project-number" className={fieldLabelClass}>
                    GCP Project Number (<code>GCP_PROJECT_NUMBER</code>)
                  </label>
                  <Input
                    id="gcp-project-number"
                    value={setup.gcpProjectNumber}
                    onChange={(e) =>
                      updateSetup({
                        gcpProjectNumber: e.target.value.replace(/[^\d]/g, ""),
                      })
                    }
                    placeholder="e.g. 123456789012"
                    autoComplete="off"
                    spellCheck={false}
                    className="h-8 font-mono text-xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="wif-pool-id" className={fieldLabelClass}>
                      WIF Pool ID
                    </label>
                    <Input
                      id="wif-pool-id"
                      value={setup.wifPoolId}
                      onChange={(e) => updateSetup({ wifPoolId: e.target.value })}
                      placeholder="e.g. gitlab-pool"
                      autoComplete="off"
                      spellCheck={false}
                      className="h-8 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label htmlFor="wif-provider-id" className={fieldLabelClass}>
                      WIF Provider ID
                    </label>
                    <Input
                      id="wif-provider-id"
                      value={setup.wifProviderId}
                      onChange={(e) =>
                        updateSetup({ wifProviderId: e.target.value })
                      }
                      placeholder="e.g. gitlab-oidc"
                      autoComplete="off"
                      spellCheck={false}
                      className="h-8 font-mono text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="deployer-sa" className={fieldLabelClass}>
                    Deployer Service Account (<code>DEPLOYER_SA</code>)
                  </label>
                  <Input
                    id="deployer-sa"
                    value={setup.deployerServiceAccount}
                    onChange={(e) =>
                      updateSetup({ deployerServiceAccount: e.target.value })
                    }
                    placeholder="e.g. deployer service account identifier"
                    autoComplete="off"
                    spellCheck={false}
                    className="h-8 font-mono text-xs"
                  />
                </div>

                <div>
                  <label htmlFor="runtime-sa" className={fieldLabelClass}>
                    Runtime Service Account (<code>RUNTIME_SA</code>)
                  </label>
                  <Input
                    id="runtime-sa"
                    value={
                      setup.runtimeServiceAccount ||
                      selectedEnvConfig?.runtimeServiceAccount ||
                      ""
                    }
                    onChange={(e) =>
                      updateSetup({ runtimeServiceAccount: e.target.value })
                    }
                    placeholder="e.g. runtime service account identifier"
                    autoComplete="off"
                    spellCheck={false}
                    className="h-8 font-mono text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Target-Specific Settings */}
            <div className="space-y-3 rounded-lg border bg-primary/5 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="block text-xs font-semibold">
                  4. Target-Specific Settings (
                  {
                    DEPLOY_TARGET_OPTIONS.find(
                      (o) => o.id === setup.deployTarget,
                    )?.label
                  }
                  )
                </span>
                <span className="font-mono text-[10.5px] text-muted-foreground">
                  {setup.deployTarget === "agent_engine" &&
                    "Uses: GCP_PROJECT_ID, GCP_LOCATION, WIF + DEPLOYER_SA"}
                  {setup.deployTarget === "cloud_run" &&
                    "Uses: GCP_PROJECT_ID, GCP_LOCATION, RUNTIME_SA + Dockerfile"}
                  {setup.deployTarget === "gemini_enterprise" &&
                    "Uses: Agent Engine + GE_APP_ID & GE_LOCATION"}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="agent-display-name" className={fieldLabelClass}>
                    Agent Display / Service Name (<code>AGENT_DISPLAY_NAME</code>)
                  </label>
                  <Input
                    id="agent-display-name"
                    value={setup.agentDisplayName}
                    onChange={(e) =>
                      updateSetup({ agentDisplayName: e.target.value })
                    }
                    placeholder="e.g. my-team-agent"
                    autoComplete="off"
                    spellCheck={false}
                    className="h-8 font-mono text-xs"
                  />
                </div>

                {setup.deployTarget === "gemini_enterprise" && (
                  <>
                    <div>
                      <label htmlFor="ge-app-id" className={fieldLabelClass}>
                        Gemini Enterprise App ID (<code>GE_APP_ID</code>)
                      </label>
                      <Input
                        id="ge-app-id"
                        value={setup.geminiEnterpriseAppId}
                        onChange={(e) =>
                          updateSetup({ geminiEnterpriseAppId: e.target.value })
                        }
                        placeholder="e.g. engine-id-from-discovery-engine"
                        autoComplete="off"
                        spellCheck={false}
                        className="h-8 font-mono text-xs"
                      />
                    </div>
                    <div>
                      <label htmlFor="ge-location" className={fieldLabelClass}>
                        Discovery Engine Location (<code>GE_LOCATION</code>)
                      </label>
                      <select
                        id="ge-location"
                        value={setup.geminiEnterpriseLocation}
                        onChange={(e) =>
                          updateSetup({
                            geminiEnterpriseLocation: e.target.value as
                              | "global"
                              | "us"
                              | "eu",
                          })
                        }
                        className="h-8 w-full rounded-lg border border-input bg-background px-2.5 font-mono text-xs"
                      >
                        <option value="global">global</option>
                        <option value="us">us</option>
                        <option value="eu">eu</option>
                      </select>
                    </div>
                    <div>
                      <label
                        htmlFor="agent-description"
                        className={fieldLabelClass}
                      >
                        Agent Description (<code>AGENT_DESCRIPTION</code>)
                      </label>
                      <Input
                        id="agent-description"
                        value={setup.agentDescription}
                        onChange={(e) =>
                          updateSetup({ agentDescription: e.target.value })
                        }
                        placeholder="e.g. Internal team assistant"
                        autoComplete="off"
                        className="h-8 text-xs"
                      />
                    </div>
                  </>
                )}
              </div>

              {setup.deployTarget === "cloud_run" && !effectiveRuntimeSa && (
                <p className="text-[11px] text-muted-foreground">
                  Tip: Cloud Run deployments pass <code>RUNTIME_SA</code> to{" "}
                  <code>gcloud run deploy --service-account</code>. Fill in{" "}
                  <strong>Runtime Service Account</strong> above.
                </p>
              )}
            </div>

            {/* Collapsible First-Time GCP WIF Bootstrap Helper */}
            <div className="rounded-lg border bg-card/60">
              <button
                type="button"
                onClick={() => setShowBootstrapHelper((v) => !v)}
                className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-xs font-medium hover:bg-muted/40"
              >
                <span className="flex items-center gap-2">
                  <Terminal className="size-3.5 text-primary" aria-hidden />
                  Need to set up Workload Identity Federation in GCP for the first time?
                </span>
                {showBootstrapHelper ? (
                  <ChevronUp className="size-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="size-4 text-muted-foreground" />
                )}
              </button>
              {showBootstrapHelper && (
                <div className="space-y-2 border-t px-3.5 py-3 text-xs">
                  <p className="text-[11px] text-muted-foreground">
                    Your generated kit includes{" "}
                    <code>deploy/bootstrap_gcp_gitlab.sh</code>, which creates
                    the GCP Workload Identity Pool, OIDC Provider, and Least-Privilege
                    Service Accounts for your GitLab group. Run this once in Google
                    Cloud Shell:
                  </p>
                  <div className="relative">
                    <pre className="overflow-x-auto rounded-md border bg-muted/50 p-2.5 font-mono text-[11px] leading-relaxed">
                      {bootstrapCmd}
                    </pre>
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      className="absolute top-2 right-2"
                      onClick={async () => {
                        await navigator.clipboard.writeText(bootstrapCmd);
                        toast.success("Copied WIF bootstrap command.");
                      }}
                    >
                      <Copy className="size-3" /> Copy
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Panel>
      </div>

      {/* c) Readiness list with green/red states and plain-language fixes */}
      <Panel
        id="deployment-readiness"
        icon={ShieldCheck}
        title="Deployment Readiness Checklist"
        description={
          allReady
            ? "All deployment setup checks pass. Proceed to Step 6 to review files and push to GitLab."
            : "Resolve the red items below before pushing your kit to GitLab."
        }
      >
        <ul className="divide-y divide-border/60">
          {readinessItems.map((item) => (
            <li
              key={item.id}
              className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
            >
              {item.ok ? (
                <CheckCircle2
                  className="mt-0.5 size-4 shrink-0 text-success"
                  aria-label="Ready"
                />
              ) : (
                <XCircle
                  className="mt-0.5 size-4 shrink-0 text-destructive"
                  aria-label="Action needed"
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{item.label}</span>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase",
                      item.ok
                        ? "bg-success/15 text-success"
                        : "bg-destructive/15 text-destructive",
                    )}
                  >
                    {item.ok ? "Green" : "Red"}
                  </span>
                </div>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  {item.ok ? item.okText : item.fixText}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
