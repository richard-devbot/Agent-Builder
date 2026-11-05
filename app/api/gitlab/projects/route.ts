import { NextResponse, type NextRequest } from "next/server";
import { requireApiSession } from "@/lib/intake/route-utils";
import {
  getValidGitLabAuth,
  gitlabFetch,
  mapGitLabErrorResponse,
  resolveGitLabNamespace,
  withRefreshedCookie,
} from "@/lib/gitlab/client";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sessionOrRes = await requireApiSession();
  if (sessionOrRes instanceof Response) return sessionOrRes;

  try {
    const authCtx = await getValidGitLabAuth(req);
    if (!authCtx) {
      return NextResponse.json(
        {
          error:
            "Connect GitLab first via OAuth or Personal Access Token before listing projects.",
        },
        { status: 401 },
      );
    }

    const queryGroup = req.nextUrl.searchParams
      .get("groupPath")
      ?.trim()
      .replace(/^\/+|\/+$/g, "");
    const resolved = await resolveGitLabNamespace(authCtx, queryGroup);
    if (!resolved.ok) {
      return mapGitLabErrorResponse(
        resolved.status,
        authCtx.config,
        resolved.detail,
      );
    }

    const { namespace } = resolved;
    const projectsRes =
      namespace.kind === "group"
        ? await gitlabFetch(
            authCtx,
            `/groups/${namespace.id}/projects?include_subgroups=true&per_page=50&order_by=last_activity_at&sort=desc`,
          )
        : await gitlabFetch(
            authCtx,
            `/users/${encodeURIComponent(namespace.fullPath)}/projects?per_page=50&order_by=last_activity_at&sort=desc`,
          );
    if (!projectsRes.ok) {
      return mapGitLabErrorResponse(projectsRes.status, authCtx.config);
    }

    const rawProjects = (await projectsRes.json()) as Array<{
      id: number;
      name: string;
      path: string;
      path_with_namespace: string;
      web_url: string;
      default_branch?: string;
    }>;

    const projects = rawProjects.map((p) => ({
      id: p.id,
      name: p.name,
      path: p.path,
      pathWithNamespace: p.path_with_namespace,
      webUrl: p.web_url,
      defaultBranch: p.default_branch || "main",
    }));

    return withRefreshedCookie(NextResponse.json({ projects }), authCtx);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to list projects in GitLab group.",
      },
      { status: 500 },
    );
  }
}
