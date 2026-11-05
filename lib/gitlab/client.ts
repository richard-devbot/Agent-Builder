/**
 * Server-only GitLab OAuth 2.0 + REST API v4 client.
 * Handles automatic token refresh before expiry, release tag formatting, and
 * structured error mapping for 401, 403, and 409/400 responses.
 */

import { NextResponse, type NextRequest } from "next/server";
import { loadGitLabServerConfig } from "@/lib/config/server";
import {
  GITLAB_DISCONNECTED_COOKIE,
  readGitLabTokensFromRequest,
  setGitLabTokenCookie,
  type GitLabTokenSet,
} from "./token-cookie";

const REFRESH_BUFFER_MS = 60_000; // Refresh 60 seconds before expiry
const PAT_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface ActiveGitLabAuth {
  accessToken: string;
  tokens: GitLabTokenSet;
  refreshed: boolean;
  authMode: "oauth" | "pat_cookie" | "pat_env";
  config: ReturnType<typeof loadGitLabServerConfig>;
}

function buildEnvPatFallback(
  config: ReturnType<typeof loadGitLabServerConfig>,
): ActiveGitLabAuth | null {
  if (!config.accessToken) return null;
  const tokens: GitLabTokenSet = {
    access_token: config.accessToken,
    refresh_token: "",
    expires_at: Date.now() + PAT_DURATION_MS,
    auth_mode: "pat",
  };
  return {
    accessToken: config.accessToken,
    tokens,
    refreshed: false,
    authMode: "pat_env",
    config,
  };
}

export async function getValidGitLabAuth(
  req: NextRequest,
): Promise<ActiveGitLabAuth | null> {
  const config = loadGitLabServerConfig();
  const existing = readGitLabTokensFromRequest(req, config.tokenEncKey);
  const explicitlyDisconnected =
    req.cookies.get(GITLAB_DISCONNECTED_COOKIE)?.value === "1";

  if (!existing) {
    if (explicitlyDisconnected) return null;
    return buildEnvPatFallback(config);
  }

  if (existing.auth_mode === "pat") {
    return {
      accessToken: existing.access_token,
      tokens: existing,
      refreshed: false,
      authMode: "pat_cookie",
      config,
    };
  }

  if (existing.expires_at - Date.now() > REFRESH_BUFFER_MS) {
    return {
      accessToken: existing.access_token,
      tokens: existing,
      refreshed: false,
      authMode: "oauth",
      config,
    };
  }

  // Refresh before expiry
  if (!existing.refresh_token || !config.clientId || !config.clientSecret) {
    return explicitlyDisconnected ? null : buildEnvPatFallback(config);
  }
  const redirectUri =
    config.redirectUri || `${new URL(req.url).origin}/api/gitlab/callback`;

  try {
    const tokenRes = await fetch(`${config.baseUrl}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: existing.refresh_token,
        grant_type: "refresh_token",
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      return explicitlyDisconnected ? null : buildEnvPatFallback(config);
    }

    const data = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    if (!data.access_token) {
      return explicitlyDisconnected ? null : buildEnvPatFallback(config);
    }

    const updated: GitLabTokenSet = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || existing.refresh_token,
      expires_at: Date.now() + (data.expires_in ?? 7200) * 1000,
      auth_mode: "oauth",
    };

    return {
      accessToken: updated.access_token,
      tokens: updated,
      refreshed: true,
      authMode: "oauth",
      config,
    };
  } catch {
    return explicitlyDisconnected ? null : buildEnvPatFallback(config);
  }
}

export function withRefreshedCookie(
  res: NextResponse,
  authCtx: ActiveGitLabAuth,
): NextResponse {
  if (authCtx.refreshed) {
    setGitLabTokenCookie(res, authCtx.tokens, authCtx.config.tokenEncKey);
  }
  return res;
}

export async function gitlabFetch(
  authCtx: ActiveGitLabAuth,
  apiPath: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = `${authCtx.config.baseUrl}/api/v4${apiPath.startsWith("/") ? apiPath : `/${apiPath}`}`;
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${authCtx.accessToken}`);
  if (authCtx.authMode !== "oauth" || authCtx.accessToken.startsWith("glpat-")) {
    headers.set("PRIVATE-TOKEN", authCtx.accessToken);
  }
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return fetch(url, {
    ...init,
    headers,
    cache: "no-store",
  });
}

export interface ResolvedGitLabNamespace {
  id: number;
  fullPath: string;
  kind: "group" | "user";
}

/**
 * Resolves either a GitLab Group or a Personal User Namespace from `requestedPath`
 * (or falls back to the first accessible group / authenticated user's namespace).
 */
export async function resolveGitLabNamespace(
  authCtx: ActiveGitLabAuth,
  requestedPath?: string,
): Promise<
  | { ok: true; namespace: ResolvedGitLabNamespace }
  | { ok: false; status: number; detail?: string }
> {
  let targetPath = (requestedPath?.trim() || authCtx.config.groupPath).replace(
    /^\/+|\/+$/g,
    "",
  );

  // If no target path was specified, fall back to first accessible group or personal namespace
  if (!targetPath) {
    const groupsRes = await gitlabFetch(
      authCtx,
      "/groups?min_access_level=30&per_page=1&order_by=path&sort=asc",
    );
    if (groupsRes.ok) {
      const groups = (await groupsRes.json()) as Array<{
        id: number;
        full_path: string;
      }>;
      if (groups[0]) {
        return {
          ok: true,
          namespace: {
            id: groups[0].id,
            fullPath: groups[0].full_path,
            kind: "group",
          },
        };
      }
    }
    const userRes = await gitlabFetch(authCtx, "/user");
    if (userRes.ok) {
      const user = (await userRes.json()) as {
        id: number;
        username: string;
        namespace_id?: number;
      };
      targetPath = user.username;
    }
  }

  if (!targetPath) {
    return {
      ok: false,
      status: 400,
      detail:
        "Target GitLab group or namespace is not set. Select or enter a GitLab group path in Step 5 (Deployment Setup).",
    };
  }

  // 1. Try resolving as a GitLab group first
  const groupRes = await gitlabFetch(
    authCtx,
    `/groups/${encodeURIComponent(targetPath)}`,
  );
  if (groupRes.ok) {
    const groupData = (await groupRes.json()) as {
      id: number;
      full_path: string;
    };
    return {
      ok: true,
      namespace: {
        id: groupData.id,
        fullPath: groupData.full_path,
        kind: "group",
      },
    };
  }

  // 2. Fallback: try resolving as a GitLab namespace (handles personal user namespaces too)
  const nsRes = await gitlabFetch(
    authCtx,
    `/namespaces/${encodeURIComponent(targetPath)}`,
  );
  if (nsRes.ok) {
    const nsData = (await nsRes.json()) as {
      id: number;
      full_path: string;
      kind?: string;
    };
    return {
      ok: true,
      namespace: {
        id: nsData.id,
        fullPath: nsData.full_path,
        kind: nsData.kind === "user" ? "user" : "group",
      },
    };
  }

  return {
    ok: false,
    status: groupRes.status,
    detail: `Could not resolve GitLab group or namespace '${targetPath}'.`,
  };
}

export function mapGitLabErrorResponse(
  status: number,
  config: { groupPath: string; ownerContact: string },
  detail?: string,
): NextResponse {
  if (status === 401) {
    return NextResponse.json(
      {
        error: "Your GitLab session expired or was revoked. Please reconnect GitLab via OAuth.",
      },
      { status: 401 },
    );
  }
  if (status === 403) {
    return NextResponse.json(
      {
        error: `You need Developer role in ${config.groupPath}; request it from ${config.ownerContact}`,
      },
      { status: 403 },
    );
  }
  if (status === 409 || status === 400) {
    return NextResponse.json(
      {
        error:
          detail ||
          "Project name is already taken or invalid in this GitLab group. Choose another project slug.",
      },
      { status },
    );
  }
  return NextResponse.json(
    { error: detail || `GitLab API request failed with status ${status}.` },
    { status },
  );
}

/**
 * Formats a reproducible release tag name: `v<yyyymmdd-hhmm>-<shortsha>`
 */
export function formatReleaseTagName(commitSha: string, now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = now.getUTCFullYear();
  const mm = pad(now.getUTCMonth() + 1);
  const dd = pad(now.getUTCDate());
  const hh = pad(now.getUTCHours());
  const min = pad(now.getUTCMinutes());
  const shortSha = commitSha.trim().slice(0, 7).toLowerCase();
  return `v${yyyy}${mm}${dd}-${hh}${min}-${shortSha}`;
}

export function isBinaryContent(contents: string): boolean {
  return /[\u0000-\u0008]/.test(contents);
}
