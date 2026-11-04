import { NextResponse, type NextRequest } from "next/server";
import { requireApiSession } from "@/lib/intake/route-utils";
import {
  getValidGitLabAuth,
  gitlabFetch,
  mapGitLabErrorResponse,
  withRefreshedCookie,
} from "@/lib/gitlab/client";
import { DeploymentRecordSchema, type DeploymentRecord } from "@/lib/storage";

export const runtime = "nodejs";

function buildPlainFailureExplanation(jobName: string, traceTail: string): {
  explanation: string;
  antigravityFixPrompt: string;
} {
  let explanation = `Pipeline job "${jobName}" failed during execution.`;
  if (jobName === "mandatory_files" || traceTail.includes("check_mandatory_files.py")) {
    explanation =
      "The mandatory-files gate detected missing required ADK kit files, unpinned dependencies in requirements.txt, or missing keys in .env.example.";
  } else if (jobName === "secret_scan" || traceTail.toLowerCase().includes("gitleaks")) {
    explanation =
      "The secret scan detected a credential or token in the repository. Remove the secret, rotate it immediately, and reference Google Secret Manager instead.";
  } else if (jobName === "sast" || traceTail.toLowerCase().includes("semgrep")) {
    explanation =
      "The static security analysis (Semgrep) flagged a policy violation (such as verify=False, shell=True, hard-coded resource IDs, or unauthenticated Cloud Run settings).";
  } else if (jobName === "smoke_test") {
    explanation =
      "The agent smoke test failed to import root_agent from <agent_folder>/agent.py or install requirements.txt.";
  } else if (jobName === "deploy_gcp") {
    explanation =
      "The Google Cloud deployment step failed. Verify that GitLab group-level WIF variables (GCP_PROJECT_ID, GCP_PROJECT_NUMBER, WIF_POOL_ID, WIF_PROVIDER_ID, DEPLOYER_SA, RUNTIME_SA) are configured and that the deployer service account has permission.";
  }

  const sanitizedExcerpt = traceTail
    .split(/\r?\n/)
    .slice(-25)
    .join("\n")
    .trim();

  const antigravityFixPrompt = [
    `Fix the failing GitLab CI job "${jobName}" in this repository without changing agent business behaviour, following docs/AUTH-STANDARD.md and the company deployment standard.`,
    "",
    `Plain-language diagnosis: ${explanation}`,
    sanitizedExcerpt ? `\nRecent job log excerpt:\n${sanitizedExcerpt}` : "",
    "",
    "After fixing, run: python scripts/check_mandatory_files.py --agent <agent_folder>",
  ]
    .filter(Boolean)
    .join("\n");

  return { explanation, antigravityFixPrompt };
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string; pipelineId: string }> },
) {
  const sessionOrRes = await requireApiSession();
  if (sessionOrRes instanceof Response) return sessionOrRes;

  const { id, pipelineId } = await context.params;
  if (!/^\d+$/.test(id) || !/^\d+$/.test(pipelineId)) {
    return NextResponse.json(
      { error: "Invalid project ID or pipeline ID." },
      { status: 400 },
    );
  }

  try {
    const authCtx = await getValidGitLabAuth(req);
    if (!authCtx) {
      return NextResponse.json(
        { error: "Connect GitLab first via OAuth." },
        { status: 401 },
      );
    }

    const [pipeRes, jobsRes] = await Promise.all([
      gitlabFetch(authCtx, `/projects/${id}/pipelines/${pipelineId}`),
      gitlabFetch(authCtx, `/projects/${id}/pipelines/${pipelineId}/jobs?per_page=50`),
    ]);

    if (!pipeRes.ok) {
      return mapGitLabErrorResponse(pipeRes.status, authCtx.config);
    }

    const pipeline = (await pipeRes.json()) as {
      id: number;
      status: string;
      ref: string;
      sha: string;
      web_url: string;
    };

    const rawJobs = jobsRes.ok
      ? ((await jobsRes.json()) as Array<{
          id: number;
          name: string;
          stage: string;
          status: string;
          web_url: string;
          failure_reason?: string;
        }>)
      : [];

    const jobs = rawJobs.map((j) => ({
      id: j.id,
      name: j.name,
      stage: j.stage,
      status: j.status,
      webUrl: j.web_url,
      failureReason: j.failure_reason,
    }));

    let deploymentRecord: DeploymentRecord | null = null;
    let failedJob: {
      name: string;
      stage: string;
      webUrl: string;
      explanation: string;
      antigravityFixPrompt: string;
    } | null = null;

    if (pipeline.status === "success") {
      const deployJob =
        rawJobs.find((j) => j.name === "deploy_gcp" && j.status === "success") ||
        rawJobs.find((j) => j.stage === "deploy" && j.status === "success");

      if (deployJob) {
        const artifactRes = await gitlabFetch(
          authCtx,
          `/projects/${id}/jobs/${deployJob.id}/artifacts/deployment-record.json`,
        );
        if (artifactRes.ok) {
          const rawArtifact = await artifactRes.json().catch(() => null);
          const validated = DeploymentRecordSchema.safeParse(rawArtifact);
          if (validated.success) {
            deploymentRecord = validated.data;
          } else {
            return withRefreshedCookie(
              NextResponse.json(
                {
                  error: `deployment-record.json failed validation: ${validated.error.issues.map((i) => i.message).join("; ")}`,
                  id: pipeline.id,
                  status: "failed",
                  ref: pipeline.ref,
                  sha: pipeline.sha,
                  webUrl: pipeline.web_url,
                  jobs,
                },
                { status: 422 },
              ),
              authCtx,
            );
          }
        }
      }
    } else if (pipeline.status === "failed") {
      const failing = rawJobs.find((j) => j.status === "failed");
      if (failing) {
        let traceTail = "";
        const traceRes = await gitlabFetch(
          authCtx,
          `/projects/${id}/jobs/${failing.id}/trace`,
        );
        if (traceRes.ok) {
          const fullTrace = await traceRes.text();
          traceTail = fullTrace.slice(-3000);
        }
        const { explanation, antigravityFixPrompt } =
          buildPlainFailureExplanation(failing.name, traceTail);
        failedJob = {
          name: failing.name,
          stage: failing.stage,
          webUrl: failing.web_url,
          explanation,
          antigravityFixPrompt,
        };
      }
    }

    return withRefreshedCookie(
      NextResponse.json({
        id: pipeline.id,
        status: pipeline.status,
        ref: pipeline.ref,
        sha: pipeline.sha,
        webUrl: pipeline.web_url,
        jobs,
        deploymentRecord,
        failedJob,
        failureExplanation: failedJob?.explanation ?? null,
        antigravityFixPrompt: failedJob?.antigravityFixPrompt ?? null,
      }),
      authCtx,
    );
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to poll GitLab pipeline status.",
      },
      { status: 500 },
    );
  }
}
