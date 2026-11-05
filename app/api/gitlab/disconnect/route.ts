import { NextResponse, type NextRequest } from "next/server";
import { requireApiSession } from "@/lib/intake/route-utils";
import { loadGitLabServerConfig } from "@/lib/config/server";
import {
  clearGitLabTokenCookie,
  readGitLabTokensFromRequest,
} from "@/lib/gitlab/token-cookie";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const sessionOrRes = await requireApiSession();
  if (sessionOrRes instanceof Response) return sessionOrRes;

  try {
    const config = loadGitLabServerConfig();
    const tokens = readGitLabTokensFromRequest(req, config.tokenEncKey);
    if (
      tokens?.access_token &&
      tokens.auth_mode !== "pat" &&
      config.clientId &&
      config.clientSecret
    ) {
      await fetch(`${config.baseUrl}/oauth/revoke`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          token: tokens.access_token,
        }),
      }).catch(() => {});
    }
  } catch {
    // Still clear cookie even if server config or revocation fails
  }

  const res = NextResponse.json({ disconnected: true });
  clearGitLabTokenCookie(res);
  return res;
}
