import { createHash, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { requireApiSession } from "@/lib/intake/route-utils";
import { loadGitLabServerConfig } from "@/lib/config/server";
import {
  encryptAes256Gcm,
  GITLAB_COOKIE_PATH,
  GITLAB_PKCE_COOKIE,
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
  const returnToParam = reqUrl.searchParams.get("returnTo");
  const returnTo =
    returnToParam && returnToParam.startsWith("/") ? returnToParam : "/studio";

  const state = randomBytes(24).toString("base64url");
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier, "ascii")
    .digest("base64url");

  const redirectUri =
    config.redirectUri || `${reqUrl.origin}/api/gitlab/callback`;

  const authorizeUrl = new URL(`${config.baseUrl}/oauth/authorize`);
  authorizeUrl.searchParams.set("client_id", config.clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("scope", "api read_user");
  authorizeUrl.searchParams.set("code_challenge", codeChallenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");

  const pkcePayload: GitLabPkceState = {
    state,
    code_verifier: codeVerifier,
    returnTo,
    created_at: Date.now(),
  };

  const encryptedPkce = encryptAes256Gcm(pkcePayload, config.tokenEncKey);
  const res = NextResponse.redirect(authorizeUrl, { status: 302 });
  res.cookies.set(GITLAB_PKCE_COOKIE, encryptedPkce, {
    httpOnly: true,
    secure: reqUrl.protocol === "https:" || process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: GITLAB_COOKIE_PATH,
    maxAge: 600, // 10 minutes
  });
  return res;
}
