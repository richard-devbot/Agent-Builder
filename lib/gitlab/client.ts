/**
 * Server-only GitLab OAuth 2.0 + REST API v4 client.
 * Handles automatic token refresh before expiry, release tag formatting, and
 * structured error mapping for 401, 403, and 409/400 responses.
 */

import { NextResponse, type NextRequest } from "next/server";
import { loadGitLabServerConfig } from "@/lib/config/server";
import {
  readGitLabTokensFromRequest,
  setGitLabTokenCookie,
  type GitLabTokenSet,
} from "./token-cookie";

const REFRESH_BUFFER_MS = 60_000; // Refresh 60 seconds before expiry

export interface ActiveGitLabAuth {
  accessToken: string;
  tokens: GitLabTokenSet;
  refreshed: boolean;
  config: ReturnType<typeof loadGitLabServerConfig>;
}

export async function getValidGitLabAuth(
  req: NextRequest,
): Promise<ActiveGitLabAuth | null> {
  const config = loadGitLabServerConfig();
  const existing = readGitLabTokensFromRequest(req, config.tokenEncKey);
  if (!existing) return null;

  if (existing.expires_at - Date.now() > REFRESH_BUFFER_MS) {
    return {
      accessToken: existing.access_token,
      tokens: existing,
      refreshed: false,
      config,
    };
  }

  // Refresh before expiry
  if (!existing.refresh_token) return null;
  const redirectUri =
    config.redirectUri || `${new URL(req.url).origin}/api/gitlab/callback`;

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
    return null;
  }

  const data = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!data.access_token) return null;

  const updated: GitLabTokenSet = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || existing.refresh_token,
    expires_at: Date.now() + (data.expires_in ?? 7200) * 1000,
  };

  return {
    accessToken: updated.access_token,
    tokens: updated,
    refreshed: true,
    config,
  };
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
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return fetch(url, {
    ...init,
    headers,
    cache: "no-store",
  });
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
