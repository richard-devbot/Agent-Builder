"use client";

/**
 * Step 7 — Deploy to Cloud (also rendered standalone at `/deploy-to-cloud`).
 *
 * 1. Lists the user's projects in the configured GitLab group.
 * 2. For the chosen project, lists recent commits on the default branch and
 *    existing release tags (author, date, message, pipeline status).
 * 3. User selects the FINAL commit + deploy target (agent_engine | cloud_run |
 *    gemini_enterprise) + environment (prod hidden unless Approver/Admin).
 * 4. Confirmation dialog summarising version, target, environment, GCP project.
 * 5. Creates a release tag `v<yyyymmdd-hhmm>-<shortsha>` and triggers a GitLab
 *    CI pipeline on that tag with DEPLOY_TARGET and DEPLOY_ENV.
 * 6. Polls pipeline/job status with a live stage timeline. On success, fetches
 *    `deployment-record.json`, validates the 19-digit RESOURCE_ID for Agent
 *    Engine targets, and saves it to the localStorage Registry. On failure,
 *    shows the failing job, a plain-language explanation, and a copy-ready
 *    "fix prompt for Antigravity".
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Cloud,
  ExternalLink,
  GitBranch,
  GitCommit,
  Loader2,
  Play,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Tag,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { canDeployProd, type AppRole } from "@/lib/auth/roles";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  publicConfig,
  type DeployEnvironmentId,
  type DeployTarget,
} from "@/lib/config/public";
import {
  loadDeploymentRegistry,
  loadDeploymentSetup,
  loadLastPushRecord,
  saveDeploymentRecordToRegistry,
  type DeploymentRecord,
} from "@/lib/storage";
import { cn } from "@/lib/utils";
import { Panel, StepHeader, fieldLabelClass } from "./primitives";
import { buildCiVariablesFromSetup } from "./step-deployment-setup";
import type { KitBuilderState } from "./use-kit-builder-state";

export interface GitLabProjectSummary {
  id: number;
  name: string;
  path: string;
  pathWithNamespace: string;
  webUrl: string;
  defaultBranch: string;
}

export interface GitLabCommitSummary {
  sha: string;
  shortId: string;
  title: string;
  authorName: string;
  committedDate: string;
  webUrl: string;
  pipelineStatus?: string | null;
}

export interface GitLabTagSummary {
  name: string;
  commitSha: string;
  message?: string;
}

export interface GitLabJobStatus {
  id: number;
  name: string;
  stage: string;
  status: string;
  webUrl: string;
  failureReason?: string | null;
}

export interface GitLabPipelinePollResponse {
  id: number;
  status: string;
  ref: string;
  sha: string;
  webUrl: string;
  jobs: GitLabJobStatus[];
  deploymentRecord?: DeploymentRecord | null;
  failureExplanation?: string | null;
  antigravityFixPrompt?: string | null;
}

const TARGET_LABELS: Record<DeployTarget, string> = {
  agent_engine: "Agent Engine (Vertex AI)",
  cloud_run: "Cloud Run",
  gemini_enterprise: "Gemini Enterprise (Agent Engine + Register)",
};

export function StepDeployToCloud({
  s,
  standalone = false,
}: {
  s?: KitBuilderState;
  standalone?: boolean;
}) {
  const [projects, setProjects] = useState<GitLabProjectSummary[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(
    () => loadLastPushRecord()?.projectId ?? null,
  );

  const [commits, setCommits] = useState<GitLabCommitSummary[]>([]);
  const [tags, setTags] = useState<GitLabTagSummary[]>([]);
  const [loadingCommits, setLoadingCommits] = useState(false);
  const [selectedCommitSha, setSelectedCommitSha] = useState<string>("");

  const [target, setTarget] = useState<DeployTarget>(
    () => (s ? s.deploymentSetup : loadDeploymentSetup()).deployTarget || "agent_engine",
  );
  const [environment, setEnvironment] = useState<DeployEnvironmentId>(
    () => (s ? s.deploymentSetup : loadDeploymentSetup()).environment || "dev",
  );
  const [userRoles, setUserRoles] = useState<AppRole[]>(["Builder"]);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [activePipeline, setActivePipeline] = useState<{
    projectId: number;
    pipelineId: number;
    tag: string;
  } | null>(null);
  const [pollData, setPollData] = useState<GitLabPipelinePollResponse | null>(null);

  const [registry, setRegistry] = useState<DeploymentRecord[]>(() =>
    loadDeploymentRegistry(),
  );

  useEffect(() => {
    const lastPush = loadLastPushRecord();
    void fetch("/api/auth/session", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((sess: { user?: { roles?: AppRole[] } } | null) => {
        if (sess?.user?.roles) setUserRoles(sess.user.roles);
      })
      .catch(() => {});

    void fetchProjects(lastPush?.projectId ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchProjects(preferredId: number | null = selectedProjectId) {
    setLoadingProjects(true);
    setProjectsError(null);
    try {
      const currentSetup = s ? s.deploymentSetup : loadDeploymentSetup();
      const groupParam = currentSetup.gitlabGroupPath.trim()
        ? `?groupPath=${encodeURIComponent(currentSetup.gitlabGroupPath.trim())}`
        : "";
      const res = await fetch(`/api/gitlab/projects${groupParam}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as {
        projects?: GitLabProjectSummary[];
        error?: string;
      };
      if (!res.ok) {
        setProjectsError(
          data.error || "Connect GitLab in Step 5 to load projects from the configured group.",
        );
        return;
      }
      const list = data.projects ?? [];
      setProjects(list);
      const chosen =
        (preferredId && list.find((p) => p.id === preferredId)?.id) ||
        list[0]?.id ||
        null;
      setSelectedProjectId(chosen);
    } catch {
      setProjectsError("Unable to load GitLab projects.");
    } finally {
      setLoadingProjects(false);
    }
  }

  useEffect(() => {
    if (!selectedProjectId) {
      return;
    }
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) setLoadingCommits(true);
    });
    fetch(`/api/gitlab/projects/${selectedProjectId}/commits`, { cache: "no-store" })
      .then((r) => r.json())
      .then(
        (data: {
          commits?: GitLabCommitSummary[];
          tags?: GitLabTagSummary[];
          error?: string;
        }) => {
          if (cancelled) return;
          const cList = data.commits ?? [];
          setCommits(cList);
          setTags(data.tags ?? []);
          setSelectedCommitSha(cList[0]?.sha ?? "");
        },
      )
      .catch(() => {
        if (!cancelled) {
          setCommits([]);
          setTags([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingCommits(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedProjectId]);

  // Poll active pipeline until terminal state
  useEffect(() => {
    if (!activePipeline) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      if (!activePipeline || cancelled) return;
      try {
        const res = await fetch(
          `/api/gitlab/projects/${activePipeline.projectId}/pipelines/${activePipeline.pipelineId}`,
          { cache: "no-store" },
        );
        if (res.ok) {
          const data = (await res.json()) as GitLabPipelinePollResponse;
          if (cancelled) return;
          setPollData(data);

          if (data.status === "success" && data.deploymentRecord) {
            try {
              saveDeploymentRecordToRegistry(data.deploymentRecord);
              setRegistry(loadDeploymentRegistry());
              toast.success("Deployment succeeded and saved to the local Registry.");
            } catch (err) {
              toast.error(
                err instanceof Error
                  ? err.message
                  : "Deployment record validation failed.",
              );
            }
            return;
          }

          if (
            data.status === "success" ||
            data.status === "failed" ||
            data.status === "canceled"
          ) {
            return;
          }
        }
      } catch {
        // Keep polling on transient error
      }
      if (!cancelled) {
        timer = setTimeout(poll, 3500);
      }
    }

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [activePipeline]);

  const prodAllowed = canDeployProd(userRoles);
  const availableEnvs = (["dev", "uat", "prod"] as DeployEnvironmentId[]).filter(
    (e) => e !== "prod" || prodAllowed,
  );
  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null;
  const selectedCommit = commits.find((c) => c.sha === selectedCommitSha) ?? null;
  const envCfg = publicConfig.environments[environment];

  async function confirmAndDeploy() {
    if (!selectedProject || !selectedCommit) return;
    setTriggering(true);
    try {
      const currentSetup = s ? s.deploymentSetup : loadDeploymentSetup();
      const res = await fetch(
        `/api/gitlab/projects/${selectedProject.id}/deploy`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            commitSha: selectedCommit.sha,
            deployTarget: target,
            deployEnv: environment,
            ciVariables: buildCiVariablesFromSetup({
              ...currentSetup,
              environment,
              deployTarget: target,
            }),
          }),
        },
      );
      const data = (await res.json()) as {
        tag?: string;
        pipelineId?: number;
        pipelineUrl?: string;
        error?: string;
      };
      if (!res.ok || !data.pipelineId || !data.tag) {
        toast.error(data.error || "Failed to create release tag and trigger deployment pipeline.");
        return;
      }
      setConfirmOpen(false);
      setPollData(null);
      setActivePipeline({
        projectId: selectedProject.id,
        pipelineId: data.pipelineId,
        tag: data.tag,
      });
      toast.success(`Release tag ${data.tag} created and deployment pipeline started.`);
    } catch {
      toast.error("Failed to trigger deployment pipeline.");
    } finally {
      setTriggering(false);
    }
  }

  return (
    <div className="space-y-5">
      {!standalone && <StepHeader n={7} />}

      <div className="grid grid-cols-1 gap-5 @4xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        {/* 1 & 2: Project + Commit / Tag picker */}
        <Panel
          icon={GitBranch}
          title="1. Select Repository & Commit Version"
          description="Deployments create an immutable release tag (v<yyyymmdd-hhmm>-<shortsha>) on the selected commit."
          actions={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => fetchProjects()}
              disabled={loadingProjects}
            >
              <RefreshCw className={cn("size-3.5", loadingProjects && "animate-spin")} />
              Refresh
            </Button>
          }
        >
          {projectsError ? (
            <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
              <p className="font-semibold">{projectsError}</p>
              <p className="mt-1">
                <Link href="/api/gitlab/login?returnTo=/deploy-to-cloud" prefetch={false} className="underline">
                  Connect GitLab via OAuth
                </Link>{" "}
                or push your kit in Step 6 first.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label htmlFor="deploy-project-select" className={fieldLabelClass}>
                  Project in configured GitLab group
                </label>
                <select
                  id="deploy-project-select"
                  value={selectedProjectId ?? ""}
                  onChange={(e) =>
                    setSelectedProjectId(
                      e.target.value ? Number(e.target.value) : null,
                    )
                  }
                  className="h-9 w-full rounded-lg border border-input bg-background px-3 font-mono text-xs"
                >
                  <option value="">Select a GitLab project…</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.pathWithNamespace} (default: {p.defaultBranch})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <span className={fieldLabelClass}>
                  Recent commits on default branch
                </span>
                {loadingCommits ? (
                  <p className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" /> Loading commits and tags…
                  </p>
                ) : commits.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                    No commits found. Push a kit in Step 6 first.
                  </p>
                ) : (
                  <ul className="max-h-60 divide-y overflow-y-auto rounded-lg border bg-background/50">
                    {commits.map((c) => {
                      const active = c.sha === selectedCommitSha;
                      return (
                        <li key={c.sha}>
                          <button
                            type="button"
                            onClick={() => setSelectedCommitSha(c.sha)}
                            className={cn(
                              "flex w-full items-start gap-3 p-3 text-left text-xs transition-colors",
                              active
                                ? "bg-primary/10"
                                : "hover:bg-muted/60",
                            )}
                          >
                            <GitCommit
                              className={cn(
                                "mt-0.5 size-4 shrink-0",
                                active ? "text-primary" : "text-muted-foreground",
                              )}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono font-semibold text-primary">
                                  {c.shortId}
                                </span>
                                <span className="truncate font-medium">
                                  {c.title}
                                </span>
                                {c.pipelineStatus && (
                                  <span className="ml-auto rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase">
                                    {c.pipelineStatus}
                                  </span>
                                )}
                              </div>
                              <p className="mt-0.5 text-[11px] text-muted-foreground">
                                {c.authorName} · {new Date(c.committedDate).toLocaleString()}
                              </p>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {tags.length > 0 && (
                <div>
                  <span className={fieldLabelClass}>Existing release tags</span>
                  <div className="flex flex-wrap gap-1.5">
                    {tags.slice(0, 8).map((t) => (
                      <span
                        key={t.name}
                        className="inline-flex items-center gap-1 rounded border bg-muted/40 px-2 py-0.5 font-mono text-[11px]"
                      >
                        <Tag className="size-3 text-primary" />
                        {t.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Panel>

        {/* 3 & 4: Target + Environment + Trigger button */}
        <Panel
          icon={Cloud}
          title="2. Select Target Runtime & Environment"
          description="All cloud actions execute inside GitLab CI via Workload Identity Federation. The platform holds zero GCP credentials."
        >
          <div className="space-y-4">
            <div>
              <label htmlFor="cloud-deploy-target" className={fieldLabelClass}>
                Deployment target
              </label>
              <select
                id="cloud-deploy-target"
                value={target}
                onChange={(e) => setTarget(e.target.value as DeployTarget)}
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-xs font-medium"
              >
                <option value="agent_engine">
                  Agent Engine (Vertex AI) — managed reasoningEngine runtime
                </option>
                <option value="cloud_run">
                  Cloud Run — internal container service with Entra ID auth
                </option>
                <option value="gemini_enterprise">
                  Gemini Enterprise — deploys to Agent Engine then registers
                </option>
              </select>
            </div>

            <div>
              <span className={fieldLabelClass}>Environment</span>
              <div className="grid grid-cols-3 gap-2">
                {availableEnvs.map((envId) => {
                  const cfg = publicConfig.environments[envId];
                  const active = environment === envId;
                  return (
                    <button
                      key={envId}
                      type="button"
                      onClick={() => setEnvironment(envId)}
                      className={cn(
                        "rounded-lg border p-2.5 text-left transition-all",
                        active
                          ? "border-primary bg-primary/10 font-semibold"
                          : "bg-background/60 hover:border-primary/40",
                      )}
                    >
                      <span className="block font-mono text-xs uppercase">
                        {envId}
                      </span>
                      <span className="block truncate text-[10.5px] text-muted-foreground">
                        {cfg.gcpProjectId || "GitLab CI var"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-lg border bg-muted/25 p-3 text-xs">
              <div className="flex justify-between py-0.5">
                <span className="text-muted-foreground">GCP Project:</span>
                <span className="font-mono font-medium">
                  {envCfg?.gcpProjectId || "Configured in GitLab Group CI"}
                </span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="text-muted-foreground">Region:</span>
                <span className="font-mono font-medium">
                  {envCfg?.region || "Configured in GitLab Group CI"}
                </span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="text-muted-foreground">Selected Commit:</span>
                <span className="font-mono font-medium">
                  {selectedCommit ? selectedCommit.shortId : "None"}
                </span>
              </div>
            </div>

            <Button
              type="button"
              className="w-full"
              disabled={!selectedProject || !selectedCommit || triggering}
              onClick={() => setConfirmOpen(true)}
            >
              <Rocket className="size-4" /> Tag Release &amp; Deploy to Cloud
            </Button>
          </div>
        </Panel>
      </div>

      {/* 6: Live Pipeline Timeline & Status */}
      {activePipeline && (
        <Panel
          icon={Play}
          title={`Live Deployment Pipeline · Tag ${activePipeline.tag}`}
          description="Polling GitLab CI stages (validate → security → test → deploy) and downloading deployment-record.json on completion."
          actions={
            pollData?.webUrl && (
              <a
                href={pollData.webUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                Open in GitLab <ExternalLink className="size-3" />
              </a>
            )
          }
        >
          {!pollData ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin text-primary" /> Starting pipeline and waiting for stage status…
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold">Pipeline #{pollData.id}</span>
                <span
                  className={cn(
                    "rounded px-2 py-0.5 font-mono text-[11px] font-semibold uppercase",
                    pollData.status === "success"
                      ? "bg-success/15 text-success"
                      : pollData.status === "failed"
                        ? "bg-destructive/15 text-destructive"
                        : "bg-primary/15 text-primary",
                  )}
                >
                  {pollData.status}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {(["validate", "security", "test", "deploy"] as const).map(
                  (stageName) => {
                    const stageJobs = pollData.jobs.filter(
                      (j) => j.stage === stageName,
                    );
                    return (
                      <div
                        key={stageName}
                        className="rounded-lg border bg-background/60 p-3"
                      >
                        <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                          Stage: {stageName}
                        </p>
                        <ul className="mt-2 space-y-1.5 text-xs">
                          {stageJobs.length === 0 ? (
                            <li className="text-muted-foreground">Pending…</li>
                          ) : (
                            stageJobs.map((job) => (
                              <li
                                key={job.id}
                                className="flex items-center justify-between gap-2"
                              >
                                <span className="flex items-center gap-1.5 truncate">
                                  {job.status === "success" ? (
                                    <CheckCircle2 className="size-3.5 text-success" />
                                  ) : job.status === "failed" ? (
                                    <XCircle className="size-3.5 text-destructive" />
                                  ) : job.status === "running" ? (
                                    <Loader2 className="size-3.5 animate-spin text-primary" />
                                  ) : (
                                    <Clock className="size-3.5 text-muted-foreground" />
                                  )}
                                  <span className="truncate font-mono text-[11px]">
                                    {job.name}
                                  </span>
                                </span>
                                <span className="font-mono text-[10px] text-muted-foreground">
                                  {job.status}
                                </span>
                              </li>
                            ))
                          )}
                        </ul>
                      </div>
                    );
                  },
                )}
              </div>

              {pollData.status === "failed" && (
                <div className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-xs">
                  <div className="flex items-start gap-2 text-destructive">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    <div>
                      <p className="font-semibold">Pipeline failed</p>
                      <p className="mt-1">
                        {pollData.failureExplanation ||
                          "One or more CI jobs failed. Review the fix prompt below."}
                      </p>
                    </div>
                  </div>
                  {pollData.antigravityFixPrompt && (
                    <div className="rounded border bg-background p-3">
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="font-semibold text-foreground">
                          Fix prompt for Antigravity
                        </span>
                        <CopyButton
                          value={pollData.antigravityFixPrompt}
                          label="Copy fix prompt"
                          size="sm"
                        />
                      </div>
                      <pre className="whitespace-pre-wrap font-mono text-[11px] text-muted-foreground">
                        {pollData.antigravityFixPrompt}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </Panel>
      )}

      {/* Deployed Agent Registry (localStorage) */}
      <Panel
        icon={ShieldCheck}
        title="Deployed Agent Registry"
        description="Verified deployment records downloaded from GitLab CI artifacts (`deployment-record.json`)."
      >
        {registry.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No deployments recorded in this browser yet. Complete a release-tag deployment above to populate the Registry.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-3">Agent</th>
                  <th className="py-2 pr-3">Target</th>
                  <th className="py-2 pr-3">Env</th>
                  <th className="py-2 pr-3">GCP Project</th>
                  <th className="py-2 pr-3">19-Digit RESOURCE_ID / Endpoint</th>
                  <th className="py-2 pr-3">Tag</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {registry.map((rec, i) => (
                  <tr key={`${rec.displayName}-${rec.tag ?? i}`}>
                    <td className="py-2.5 pr-3 font-semibold">{rec.displayName}</td>
                    <td className="py-2.5 pr-3 font-mono">{rec.target}</td>
                    <td className="py-2.5 pr-3 font-mono uppercase">{rec.environment}</td>
                    <td className="py-2.5 pr-3 font-mono">{rec.gcpProject}</td>
                    <td className="py-2.5 pr-3 font-mono text-primary">
                      {rec.resourceId || rec.url || rec.resourceName || "—"}
                    </td>
                    <td className="py-2.5 pr-3 font-mono">{rec.tag || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* Confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Cloud Deployment</DialogTitle>
            <DialogDescription>
              This will create a protected release tag on your repository and trigger the GitLab CI deployment pipeline via Workload Identity Federation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Repository:</span>
              <span className="font-mono font-semibold">
                {selectedProject?.pathWithNamespace}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Version (Commit):</span>
              <span className="font-mono font-semibold">
                {selectedCommit?.shortId} — {selectedCommit?.title}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Target Runtime:</span>
              <span className="font-semibold">{TARGET_LABELS[target]}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Environment:</span>
              <span className="font-mono font-semibold uppercase">{environment}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">GCP Project:</span>
              <span className="font-mono font-semibold">
                {envCfg?.gcpProjectId || "From GitLab Group CI"}
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={triggering}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={confirmAndDeploy}
              disabled={triggering}
            >
              {triggering ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" /> Triggering…
                </>
              ) : (
                <>
                  <Rocket className="size-3.5" /> Confirm &amp; Deploy
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
