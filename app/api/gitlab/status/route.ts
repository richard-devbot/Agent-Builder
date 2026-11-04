import { NextResponse, type NextRequest } from "next/server";
import { requireApiSession } from "@/lib/intake/route-utils";
import { publicConfig } from "@/lib/config/public";
import {
  getValidGitLabAuth,
  gitlabFetch,
  withRefreshedCookie,
} from "@/lib/gitlab/client";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sessionOrRes = await requireApiSession();
  if (sessionOrRes instanceof Response) return sessionOrRes;

  try {
    const authCtx = await getValidGitLabAuth(req);
    if (!authCtx) {
      return NextResponse.json({
        connected: false,
        baseUrl: publicConfig.gitlabBaseUrl,
        groupPath: publicConfig.gitlabGroupPath,
        ownerContact: publicConfig.gitlabGroupOwnerContact,
      });
    }

    const userRes = await gitlabFetch(authCtx, "/user");
    if (!userRes.ok) {
      return NextResponse.json({
        connected: false,
        baseUrl: authCtx.config.baseUrl,
        groupPath: authCtx.config.groupPath,
        ownerContact: authCtx.config.ownerContact,
      });
    }

    const user = (await userRes.json()) as {
      id: number;
      username: string;
      name: string;
    };

    let groups: Array<{ id: number; name: string; fullPath: string }> = [];
    try {
      const groupsRes = await gitlabFetch(
        authCtx,
        "/groups?min_access_level=30&per_page=50&order_by=path&sort=asc",
      );
      if (groupsRes.ok) {
        const rawGroups = (await groupsRes.json()) as Array<{
          id: number;
          name: string;
          full_path: string;
        }>;
        groups = rawGroups.map((g) => ({
          id: g.id,
          name: g.name,
          fullPath: g.full_path,
        }));
      }
    } catch {
      // Group listing is optional convenience
    }

    const res = NextResponse.json({
      connected: true,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
      },
      groups,
      baseUrl: authCtx.config.baseUrl,
      groupPath: authCtx.config.groupPath,
      ownerContact: authCtx.config.ownerContact,
      expiresAt: authCtx.tokens.expires_at,
    });

    return withRefreshedCookie(res, authCtx);
  } catch {
    return NextResponse.json({
      connected: false,
      baseUrl: publicConfig.gitlabBaseUrl,
      groupPath: publicConfig.gitlabGroupPath,
      ownerContact: publicConfig.gitlabGroupOwnerContact,
    });
  }
}
