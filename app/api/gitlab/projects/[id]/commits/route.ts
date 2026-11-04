import { NextResponse, type NextRequest } from "next/server";
import { requireApiSession } from "@/lib/intake/route-utils";
import {
  getValidGitLabAuth,
  gitlabFetch,
  mapGitLabErrorResponse,
  withRefreshedCookie,
} from "@/lib/gitlab/client";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const sessionOrRes = await requireApiSession();
  if (sessionOrRes instanceof Response) return sessionOrRes;

  const { id } = await context.params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: "Invalid project ID." }, { status: 400 });
  }

  try {
    const authCtx = await getValidGitLabAuth(req);
    if (!authCtx) {
      return NextResponse.json(
        { error: "Connect GitLab first via OAuth." },
        { status: 401 },
      );
    }

    const projectRes = await gitlabFetch(authCtx, `/projects/${id}`);
    if (!projectRes.ok) {
      return mapGitLabErrorResponse(projectRes.status, authCtx.config);
    }
    const project = (await projectRes.json()) as { default_branch?: string };
    const defaultBranch = project.default_branch || "main";

    const [commitsRes, tagsRes] = await Promise.all([
      gitlabFetch(
        authCtx,
        `/projects/${id}/repository/commits?ref_name=${encodeURIComponent(defaultBranch)}&per_page=15`,
      ),
      gitlabFetch(authCtx, `/projects/${id}/repository/tags?per_page=20`),
    ]);

    if (!commitsRes.ok) {
      return mapGitLabErrorResponse(commitsRes.status, authCtx.config);
    }

    const rawCommits = (await commitsRes.json()) as Array<{
      id: string;
      short_id: string;
      title: string;
      message: string;
      author_name: string;
      committed_date: string;
      web_url?: string;
      last_pipeline?: { status?: string; web_url?: string } | null;
    }>;

    // Fetch pipeline status for commits if not embedded in list response
    const commits = await Promise.all(
      rawCommits.map(async (c, idx) => {
        let pipelineStatus = c.last_pipeline?.status || null;
        let pipelineUrl = c.last_pipeline?.web_url;
        if (!pipelineStatus && idx < 5) {
          const pipeRes = await gitlabFetch(
            authCtx,
            `/projects/${id}/pipelines?sha=${encodeURIComponent(c.id)}&per_page=1`,
          );
          if (pipeRes.ok) {
            const pipes = (await pipeRes.json()) as Array<{
              status?: string;
              web_url?: string;
            }>;
            if (pipes[0]) {
              pipelineStatus = pipes[0].status || null;
              pipelineUrl = pipes[0].web_url;
            }
          }
        }
        return {
          id: c.id,
          sha: c.id,
          shortId: c.short_id,
          title: c.title,
          message: c.message,
          authorName: c.author_name,
          committedDate: c.committed_date,
          webUrl: c.web_url || "",
          pipelineStatus,
          pipelineUrl,
        };
      }),
    );

    const rawTags = tagsRes.ok
      ? ((await tagsRes.json()) as Array<{
          name: string;
          message?: string;
          target: string;
          commit?: { id?: string; committed_date?: string };
        }>)
      : [];

    const tags = rawTags.map((t) => ({
      name: t.name,
      message: t.message || "",
      target: t.commit?.id || t.target,
      commitSha: t.commit?.id || t.target,
      createdAt: t.commit?.committed_date,
    }));

    return withRefreshedCookie(
      NextResponse.json({ defaultBranch, commits, tags }),
      authCtx,
    );
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to load commits and tags from GitLab.",
      },
      { status: 500 },
    );
  }
}
