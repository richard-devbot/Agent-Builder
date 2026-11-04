import { NextResponse, type NextRequest } from "next/server";
import { requireApiSession } from "@/lib/intake/route-utils";
import { loadGitLabServerConfig } from "@/lib/config/server";
import {
  decryptAes256Gcm,
  GITLAB_COOKIE_PATH,
  GITLAB_PKCE_COOKIE,
  setGitLabTokenCookie,
  type GitLabPkceState,
} from "@/lib/gitlab/token-cookie";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sessionOrRes = await requireApiSession();
  if (sessionOrRes instanceof Response) return sessionOrRes;

  let config: ReturnType<typeof loadGitLabServerConfig>;
  try {
    config = loadGitLabServerConfig();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "GitLab is not configured." },
      { status: 500 },
    );
  }

  const reqUrl = new URL(req.url);
  const code = reqUrl.searchParams.get("code");
  const state = reqUrl.searchParams.get("state");
  const rawPkce = req.cookies.get(GITLAB_PKCE_COOKIE)?.value;

  if (!code || !state || !rawPkce) {
    return NextResponse.json(
      { error: "Missing OAuth authorization code or PKCE state cookie." },
      { status: 400 },
    );
  }

  const pkce = decryptAes256Gcm<GitLabPkceState>(rawPkce, config.tokenEncKey);
  if (
    !pkce ||
    pkce.state !== state ||
    Date.now() - pkce.created_at > 10 * 60_000
  ) {
    return NextResponse.json(
      { error: "Invalid or expired GitLab OAuth PKCE state." },
      { status: 400 },
    );
  }

  const redirectUri =
    config.redirectUri || `${reqUrl.origin}/api/gitlab/callback`;

  const tokenRes = await fetch(`${config.baseUrl}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code_verifier: pkce.code_verifier,
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.json(
      { error: "Failed to exchange GitLab OAuth authorization code for token." },
      { status: 401 },
    );
  }

  const tokenData = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };

  if (!tokenData.access_token) {
    return NextResponse.json(
      { error: "GitLab token response did not include an access_token." },
      { status: 401 },
    );
  }

  const returnTo =
    pkce.returnTo && pkce.returnTo.startsWith("/") ? pkce.returnTo : "/studio";
  const res = NextResponse.redirect(new URL(returnTo, reqUrl.origin), {
    status: 302,
  });

  res.cookies.set(GITLAB_PKCE_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: GITLAB_COOKIE_PATH,
    maxAge: 0,
  });

  setGitLabTokenCookie(
    res,
    {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || "",
      expires_at: Date.now() + (tokenData.expires_in ?? 7200) * 1000,
    },
    config.tokenEncKey,
  );

  return res;
}
