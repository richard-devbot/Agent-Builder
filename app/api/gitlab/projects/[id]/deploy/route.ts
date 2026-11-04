import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { canDeployProd } from "@/auth";
import { requireApiSession } from "@/lib/intake/route-utils";
import {
  formatReleaseTagName,
  getValidGitLabAuth,
  gitlabFetch,
  mapGitLabErrorResponse,
  withRefreshedCookie,
} from "@/lib/gitlab/client";

export const runtime = "nodejs";

const ALLOWED_DEPLOY_VARIABLES = new Set([
  "GCP_PROJECT_ID",
  "GCP_PROJECT_NUMBER",
  "GCP_LOCATION",
  "WIF_POOL_ID",
  "WIF_PROVIDER_ID",
  "DEPLOYER_SA",
  "RUNTIME_SA",
  "AGENT_DISPLAY_NAME",
  "AGENT_DESCRIPTION",
  "GE_APP_ID",
  "GE_LOCATION",
]);

const DeployRequestSchema = z.object({
  commitSha: z.string().regex(/^[0-9a-f]{7,40}$/i, "Invalid commit SHA."),
  deployTarget: z.enum(["agent_engine", "cloud_run", "gemini_enterprise"]),
  deployEnv: z.enum(["dev", "uat", "prod"]),
  ciVariables: z.record(z.string(), z.string()).optional(),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const sessionOrRes = await requireApiSession();
  if (sessionOrRes instanceof Response) return sessionOrRes;
  const session = sessionOrRes;

  const { id } = await context.params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: "Invalid project ID." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = DeployRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 },
    );
  }

  const { commitSha, deployTarget, deployEnv, ciVariables } = parsed.data;

  if (deployEnv === "prod" && !canDeployProd(session?.user?.roles)) {
    return NextResponse.json(
      {
        error:
          "Production deployments require the Approver or Admin role in Microsoft Entra ID.",
      },
      { status: 403 },
    );
  }

  try {
    const authCtx = await getValidGitLabAuth(req);
    if (!authCtx) {
      return NextResponse.json(
        { error: "Connect GitLab first via OAuth before deploying." },
        { status: 401 },
      );
    }

    const tagName = formatReleaseTagName(commitSha);

    // 1. Create release tag on the chosen commit
    const tagRes = await gitlabFetch(authCtx, `/projects/${id}/repository/tags`, {
      method: "POST",
      body: JSON.stringify({
        tag_name: tagName,
        ref: commitSha,
        message: `Release ${tagName} (${deployTarget} -> ${deployEnv}) created by ${session?.user?.email || "Agent Builder"}`,
      }),
    });

    if (!tagRes.ok && tagRes.status !== 409) {
      const errJson = (await tagRes.json().catch(() => ({}))) as {
        message?: unknown;
      };
      return mapGitLabErrorResponse(
        tagRes.status,
        authCtx.config,
        typeof errJson.message === "string"
          ? errJson.message
          : "Failed to create release tag in GitLab.",
      );
    }

    // 2. Trigger pipeline on the release tag with DEPLOY_TARGET, DEPLOY_ENV, and any Step 5 overrides
    const extraVars = Object.entries(ciVariables ?? {})
      .filter(([k, v]) => ALLOWED_DEPLOY_VARIABLES.has(k) && Boolean(v?.trim()))
      .map(([key, value]) => ({
        key,
        value: value.trim(),
        variable_type: "env_var" as const,
      }));

    const pipeRes = await gitlabFetch(authCtx, `/projects/${id}/pipeline`, {
      method: "POST",
      body: JSON.stringify({
        ref: tagName,
        variables: [
          { key: "DEPLOY_TARGET", value: deployTarget, variable_type: "env_var" },
          { key: "DEPLOY_ENV", value: deployEnv, variable_type: "env_var" },
          ...extraVars,
        ],
      }),
    });

    if (!pipeRes.ok) {
      const errJson = (await pipeRes.json().catch(() => ({}))) as {
        message?: unknown;
      };
      return mapGitLabErrorResponse(
        pipeRes.status,
        authCtx.config,
        typeof errJson.message === "string"
          ? errJson.message
          : "Failed to trigger deployment pipeline on tag.",
      );
    }

    const pipeline = (await pipeRes.json()) as {
      id: number;
      web_url: string;
      status: string;
    };

    return withRefreshedCookie(
      NextResponse.json({
        tag: tagName,
        pipelineId: pipeline.id,
        pipelineUrl: pipeline.web_url,
        status: pipeline.status,
      }),
      authCtx,
    );
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to trigger cloud deployment pipeline.",
      },
      { status: 500 },
    );
  }
}
