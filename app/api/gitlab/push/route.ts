/**
 * Server-side GitLab push flow (Phase D):
 * 1. Resolve group ID from GITLAB_GROUP_PATH (`GET /groups/:path`).
 * 2. Create project if it does not exist (`POST /projects` with `namespace_id`,
 *    `visibility: "private"`, `initialize_with_readme: false`). If it exists,
 *    push to a new branch `agent-builder/<timestamp>` and open a merge request.
 * 3. Commit all kit files in ONE commit (`POST /projects/:id/repository/commits`
 *    with `actions[]`; `base64` encoding for binary files). Message:
 *    `"chore(kit): Agent Builder kit v<kitVersion>"`.
 * 4. Return project URL, commit SHA, and pipeline URL.
 */

import { z } from "zod";
import { NextResponse, type NextRequest } from "next/server";
import { requireApiSession } from "@/lib/intake/route-utils";
import {
  getValidGitLabAuth,
  gitlabFetch,
  isBinaryContent,
  mapGitLabErrorResponse,
  resolveGitLabNamespace,
  withRefreshedCookie,
} from "@/lib/gitlab/client";

export const dynamic = "force-dynamic";

const ALLOWED_CI_VARIABLE_KEYS = new Set([
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

const PushRequestSchema = z.object({
  groupPath: z.string().max(160).optional(),
  projectName: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-_]{1,62}$/, "Invalid GitLab project slug"),
  agentFolderName: z
    .string()
    .regex(/^[a-z][a-z0-9_]{1,62}$/, "Invalid Python agent folder name"),
  kitVersion: z.string().min(1).max(32).default("2.13.0"),
  ciVariables: z.record(z.string(), z.string()).optional(),
  files: z
    .array(
      z.object({
        path: z.string().min(1).max(240),
        contents: z.string(),
        encoding: z.enum(["text", "base64"]).optional(),
      }),
    )
    .min(1)
    .max(200),
});

export async function POST(req: NextRequest) {
  const sessionOrRes = await requireApiSession();
  if (sessionOrRes instanceof Response) return sessionOrRes;

  const authCtx = await getValidGitLabAuth(req);
  if (!authCtx) {
    return NextResponse.json(
      {
        error:
          "Not connected to GitLab. Connect via Personal Access Token or OAuth in Step 5.",
      },
      { status: 401 },
    );
  }

  let parsedBody: z.infer<typeof PushRequestSchema>;
  try {
    const raw = await req.json();
    parsedBody = PushRequestSchema.parse(raw);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof z.ZodError
            ? err.issues[0]?.message || "Invalid push payload"
            : "Invalid JSON body",
      },
      { status: 400 },
    );
  }

  const { projectName, kitVersion, files, ciVariables } = parsedBody;
  const resolved = await resolveGitLabNamespace(authCtx, parsedBody.groupPath);
  if (!resolved.ok) {
    return mapGitLabErrorResponse(
      resolved.status,
      authCtx.config,
      resolved.detail,
    );
  }
  const { namespace } = resolved;

  // 2. Check if the project already exists in the group / namespace
  const fullProjectPath = `${namespace.fullPath}/${projectName}`;
  const checkRes = await gitlabFetch(
    authCtx,
    `/projects/${encodeURIComponent(fullProjectPath)}`,
  );

  let projectId: number;
  let projectWebUrl: string;
  let defaultBranch = "main";
  let existingProject = false;
  let existingFileSet = new Set<string>();

  if (checkRes.ok) {
    existingProject = true;
    const proj = (await checkRes.json()) as {
      id: number;
      web_url: string;
      default_branch?: string;
    };
    projectId = proj.id;
    projectWebUrl = proj.web_url;
    defaultBranch = proj.default_branch || "main";

    // Inspect existing tree so we use "update" vs "create" actions accurately
    const treeRes = await gitlabFetch(
      authCtx,
      `/projects/${projectId}/repository/tree?recursive=true&per_page=100&ref=${encodeURIComponent(defaultBranch)}`,
    );
    if (treeRes.ok) {
      const tree = (await treeRes.json()) as { path: string; type: string }[];
      existingFileSet = new Set(
        tree.filter((item) => item.type === "blob").map((item) => item.path),
      );
    }
  } else if (checkRes.status === 404) {
    // Create the project (POST /projects with namespace_id for groups, private, initialize_with_readme=false)
    const createPayload: Record<string, unknown> = {
      name: projectName,
      path: projectName,
      visibility: "private",
      initialize_with_readme: false,
    };
    if (namespace.kind === "group") {
      createPayload.namespace_id = namespace.id;
    }
    const createRes = await gitlabFetch(authCtx, "/projects", {
      method: "POST",
      body: JSON.stringify(createPayload),
    });
    if (!createRes.ok) {
      let errDetail: string | undefined;
      try {
        const errBody = (await createRes.json()) as { message?: unknown };
        if (errBody.message) errDetail = JSON.stringify(errBody.message);
      } catch {}
      return mapGitLabErrorResponse(createRes.status, authCtx.config, errDetail);
    }
    const created = (await createRes.json()) as {
      id: number;
      web_url: string;
      default_branch?: string;
    };
    projectId = created.id;
    projectWebUrl = created.web_url;
    defaultBranch = created.default_branch || "main";
  } else {
    return mapGitLabErrorResponse(checkRes.status, authCtx.config);
  }

  // 2b. Sync non-secret Cloud & Deploy Target CI variables entered in Step 5 to the project
  if (ciVariables) {
    for (const [key, rawVal] of Object.entries(ciVariables)) {
      const value = rawVal.trim();
      if (!ALLOWED_CI_VARIABLE_KEYS.has(key) || !value) continue;
      try {
        const createVarRes = await gitlabFetch(
          authCtx,
          `/projects/${projectId}/variables`,
          {
            method: "POST",
            body: JSON.stringify({
              key,
              value,
              variable_type: "env_var",
              protected: false,
              masked: false,
            }),
          },
        );
        if (!createVarRes.ok && createVarRes.status === 400) {
          await gitlabFetch(
            authCtx,
            `/projects/${projectId}/variables/${encodeURIComponent(key)}`,
            {
              method: "PUT",
              body: JSON.stringify({
                value,
                variable_type: "env_var",
                protected: false,
                masked: false,
              }),
            },
          );
        }
      } catch {
        // Best-effort CI variable sync (group-level variables may already exist)
      }
    }
  }

  // 3. Commit all kit files in ONE commit
  const targetBranch = existingProject
    ? `agent-builder/${Date.now()}`
    : defaultBranch;

  const actions = files.map((file) => {
    const binary = file.encoding === "base64" || isBinaryContent(file.contents);
    return {
      action: existingFileSet.has(file.path) ? "update" : "create",
      file_path: file.path,
      content: binary
        ? file.encoding === "base64"
          ? file.contents
          : Buffer.from(file.contents, "utf8").toString("base64")
        : file.contents,
      encoding: binary ? "base64" : "text",
    };
  });

  const commitPayload: Record<string, unknown> = {
    branch: targetBranch,
    commit_message: `chore(kit): Agent Builder kit v${kitVersion}`,
    actions,
  };
  if (existingProject && existingFileSet.size > 0) {
    commitPayload.start_branch = defaultBranch;
  }

  const commitRes = await gitlabFetch(
    authCtx,
    `/projects/${projectId}/repository/commits`,
    {
      method: "POST",
      body: JSON.stringify(commitPayload),
    },
  );

  if (!commitRes.ok) {
    let detail: string | undefined;
    try {
      const errJson = (await commitRes.json()) as { message?: string };
      detail = errJson.message;
    } catch {}
    return mapGitLabErrorResponse(commitRes.status, authCtx.config, detail);
  }

  const commitData = (await commitRes.json()) as { id: string; web_url?: string };
  let mergeRequestUrl: string | undefined;

  if (existingProject && targetBranch !== defaultBranch) {
    const mrRes = await gitlabFetch(
      authCtx,
      `/projects/${projectId}/merge_requests`,
      {
        method: "POST",
        body: JSON.stringify({
          source_branch: targetBranch,
          target_branch: defaultBranch,
          title: `chore(kit): Agent Builder kit v${kitVersion}`,
          remove_source_branch: true,
        }),
      },
    );
    if (mrRes.ok) {
      const mrData = (await mrRes.json()) as { web_url?: string };
      mergeRequestUrl = mrData.web_url;
    }
  }

  // 4. Look up pipeline URL for the commit
  let pipelineUrl: string | undefined;
  const pipeRes = await gitlabFetch(
    authCtx,
    `/projects/${projectId}/pipelines?sha=${encodeURIComponent(commitData.id)}&per_page=1`,
  );
  if (pipeRes.ok) {
    const pipes = (await pipeRes.json()) as { web_url?: string }[];
    pipelineUrl = pipes[0]?.web_url;
  }

  const res = NextResponse.json({
    projectId,
    projectPath: fullProjectPath,
    projectUrl: projectWebUrl,
    commitSha: commitData.id,
    branch: targetBranch,
    mergeRequestUrl,
    pipelineUrl: pipelineUrl || `${projectWebUrl}/-/pipelines`,
  });

  return withRefreshedCookie(res, authCtx);
}
