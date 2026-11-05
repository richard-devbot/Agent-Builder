import { z } from "zod";
import { NextResponse, type NextRequest } from "next/server";
import { requireApiSession } from "@/lib/intake/route-utils";
import { loadGitLabServerConfig } from "@/lib/config/server";
import { setGitLabTokenCookie } from "@/lib/gitlab/token-cookie";

export const dynamic = "force-dynamic";

const TokenConnectSchema = z.object({
  token: z.string().trim().optional(),
  useEnvToken: z.boolean().optional(),
});

const PAT_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function POST(req: NextRequest) {
  const sessionOrRes = await requireApiSession();
  if (sessionOrRes instanceof Response) return sessionOrRes;

  let config: ReturnType<typeof loadGitLabServerConfig>;
  try {
    config = loadGitLabServerConfig();
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "GitLab server config invalid.",
      },
      { status: 500 },
    );
  }

  let body: z.infer<typeof TokenConnectSchema>;
  try {
    const raw = await req.json();
    body = TokenConnectSchema.parse(raw);
  } catch {
    return NextResponse.json(
      { error: "Invalid request payload." },
      { status: 400 },
    );
  }

  const candidateToken = body.useEnvToken
    ? config.accessToken
    : body.token?.trim() || config.accessToken;

  if (!candidateToken) {
    return NextResponse.json(
      {
        error:
          "Enter a GitLab Personal Access Token (e.g. glpat-...) with 'api' and 'read_user' scopes.",
      },
      { status: 400 },
    );
  }

  // Verify token against GitLab /api/v4/user
  const userRes = await fetch(`${config.baseUrl}/api/v4/user`, {
    headers: {
      Authorization: `Bearer ${candidateToken}`,
      "PRIVATE-TOKEN": candidateToken,
    },
    cache: "no-store",
  }).catch(() => null);

  if (!userRes || !userRes.ok) {
    return NextResponse.json(
      {
        error:
          "GitLab rejected this Personal Access Token. Ensure it is active and has 'api' and 'read_user' scopes.",
      },
      { status: 401 },
    );
  }

  const user = (await userRes.json()) as {
    id: number;
    username: string;
    name: string;
  };

  let groups: Array<{ id: number; name: string; fullPath: string }> = [];
  try {
    const groupsRes = await fetch(
      `${config.baseUrl}/api/v4/groups?min_access_level=30&per_page=50&order_by=path&sort=asc`,
      {
        headers: {
          Authorization: `Bearer ${candidateToken}`,
          "PRIVATE-TOKEN": candidateToken,
        },
        cache: "no-store",
      },
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
    // Optional convenience
  }

  if (!groups.some((g) => g.fullPath === user.username)) {
    groups.push({
      id: user.id,
      name: `${user.name} (Personal namespace)`,
      fullPath: user.username,
    });
  }

  const expiresAt = Date.now() + PAT_DURATION_MS;
  const res = NextResponse.json({
    connected: true,
    authMode: body.useEnvToken ? "pat_env" : "pat_cookie",
    hasEnvToken: Boolean(config.accessToken),
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
    },
    groups,
    baseUrl: config.baseUrl,
    groupPath: config.groupPath || groups[0]?.fullPath || user.username,
    ownerContact: config.ownerContact,
    expiresAt,
  });

  setGitLabTokenCookie(
    res,
    {
      access_token: candidateToken,
      refresh_token: "",
      expires_at: expiresAt,
      auth_mode: "pat",
    },
    config.tokenEncKey,
  );

  return res;
}
