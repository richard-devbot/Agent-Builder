/**
 * Auth.js v5 (next-auth) runtime with OIDC + PKCE and encrypted JWT cookies.
 *
 * TODO(verify): When deploying with the upstream `next-auth@5` package from
 * your internal artifact registry, verify the `auth` wrapper signature for
 * Next.js 16 `proxy.ts` (`export const proxy = auth(...)`).
 */

import { createHash, createHmac, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import type { MicrosoftEntraIDConfig, MicrosoftEntraIDProfile } from "./microsoft-entra-id";
import type { AppRole, Session, SessionUser } from "./roles";

export type { AppRole, Session, SessionUser };

export interface JWT extends Record<string, unknown> {
  sub?: string;
  name?: string;
  email?: string;
  oid?: string;
  roles?: AppRole[];
  exp?: number;
}

export interface AuthenticatedNextRequest extends NextRequest {
  auth: Session | null;
}

export interface NextAuthConfig {
  secret?: string;
  trustHost?: boolean;
  session?: {
    strategy?: "jwt";
    maxAge?: number;
  };
  pages?: {
    signIn?: string;
    error?: string;
  };
  providers: MicrosoftEntraIDConfig[];
  callbacks?: {
    jwt?: (params: {
      token: JWT;
      user?: Record<string, unknown>;
      profile?: MicrosoftEntraIDProfile;
    }) => Promise<JWT> | JWT;
    session?: (params: {
      session: Session;
      token: JWT;
    }) => Promise<Session> | Session;
    authorized?: (params: {
      request: NextRequest;
      auth: Session | null;
    }) => boolean | Response | Promise<boolean | Response>;
  };
}

const SESSION_COOKIE = "authjs.session-token";
const PKCE_COOKIE = "authjs.pkce-state";
const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60; // 8 hours

export function isDevBypassEnabled(): boolean {
  return process.env.NODE_ENV === "development" && process.env.AUTH_DEV_BYPASS === "true";
}

function devBypassSession(): Session {
  return {
    user: {
      name: "Local Dev Bypass",
      email: "",
      oid: "00000000-0000-0000-0000-000000000001",
      roles: ["Builder", "Approver", "Admin"],
    },
    expires: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString(),
    devBypass: true,
  };
}

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret, "utf8").digest();
}

export function encryptJwtPayload(payload: JWT, secret: string): string {
  const key = deriveKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const exp = payload.exp ?? Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;
  const plaintext = Buffer.from(JSON.stringify({ ...payload, exp }), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${encrypted.toString("base64url")}.${tag.toString("base64url")}`;
}

export function decryptJwtPayload(token: string, secret: string): JWT | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [ivB64, ctB64, tagB64] = parts;
    const key = deriveKey(secret);
    const iv = Buffer.from(ivB64, "base64url");
    const ct = Buffer.from(ctB64, "base64url");
    const tag = Buffer.from(tagB64, "base64url");
    if (iv.length !== 12 || tag.length !== 16) return null;
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(ct), decipher.final()]);
    const parsed = JSON.parse(decrypted.toString("utf8")) as JWT;
    if (typeof parsed.exp === "number" && parsed.exp * 1000 < Date.now()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function base64UrlSha256(verifier: string): string {
  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}

function decodeJwtPayload(jwt: string): MicrosoftEntraIDProfile {
  const parts = jwt.split(".");
  if (parts.length < 2) return {};
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as MicrosoftEntraIDProfile;
  } catch {
    return {};
  }
}

async function resolveSessionFromToken(
  rawCookie: string | undefined,
  config: NextAuthConfig,
): Promise<Session | null> {
  const secret = config.secret ?? process.env.AUTH_SECRET;
  if (rawCookie && secret) {
    const token = decryptJwtPayload(rawCookie, secret);
    if (token) {
      const baseSession: Session = {
        user: {
          name: typeof token.name === "string" ? token.name : "Authenticated User",
          email: typeof token.email === "string" ? token.email : "",
          oid: typeof token.oid === "string" ? token.oid : typeof token.sub === "string" ? token.sub : "",
          roles: Array.isArray(token.roles) ? (token.roles as AppRole[]) : ["Builder"],
        },
        expires: new Date(((token.exp ?? Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS)) * 1000).toISOString(),
      };
      if (config.callbacks?.session) {
        return await config.callbacks.session({ session: baseSession, token });
      }
      return baseSession;
    }
  }
  if (isDevBypassEnabled()) {
    return devBypassSession();
  }
  return null;
}

export type ProxyHandler = (
  request: AuthenticatedNextRequest,
  context?: unknown,
) => Response | NextResponse | Promise<Response | NextResponse | void> | void;

export interface AuthFn {
  (): Promise<Session | null>;
  (handler: ProxyHandler): (request: NextRequest, context?: unknown) => Promise<Response | NextResponse>;
  (request: NextRequest, context?: unknown): Promise<Response | NextResponse>;
}

export default function NextAuth(config: NextAuthConfig) {
  const provider = config.providers[0];

  const getSecret = (): string => {
    const s = config.secret ?? process.env.AUTH_SECRET;
    if (!s) {
      throw new Error("Missing AUTH_SECRET environment variable.");
    }
    return s;
  };

  async function handleAuthRequest(req: NextRequest): Promise<Response> {
    const url = new URL(req.url);
    const pathname = url.pathname;
    const isSecure = url.protocol === "https:" || process.env.NODE_ENV === "production";

    if (pathname.endsWith("/api/auth/session") && req.method === "GET") {
      const rawCookie = req.cookies.get(SESSION_COOKIE)?.value;
      const session = await resolveSessionFromToken(rawCookie, config);
      return NextResponse.json(session, { headers: { "cache-control": "no-store" } });
    }

    if (pathname.endsWith("/api/auth/csrf") && req.method === "GET") {
      const secret = config.secret ?? process.env.AUTH_SECRET ?? "csrf";
      const csrfToken = createHmac("sha256", secret).update("authjs-csrf").digest("hex");
      return NextResponse.json({ csrfToken });
    }

    if (pathname.endsWith("/api/auth/providers") && req.method === "GET") {
      return NextResponse.json({
        "microsoft-entra-id": {
          id: "microsoft-entra-id",
          name: "Microsoft Entra ID",
          type: "oidc",
          signinUrl: `${url.origin}/api/auth/signin/microsoft-entra-id`,
          callbackUrl: `${url.origin}/api/auth/callback/microsoft-entra-id`,
        },
      });
    }

    if (
      pathname.endsWith("/api/auth/signout") &&
      (req.method === "POST" || req.method === "GET")
    ) {
      const callbackUrl = url.searchParams.get("callbackUrl") || "/login";
      const res = NextResponse.redirect(new URL(callbackUrl, url.origin), { status: 302 });
      res.cookies.delete(SESSION_COOKIE);
      return res;
    }

    if (
      pathname.endsWith("/api/auth/signin") ||
      pathname.endsWith("/api/auth/signin/microsoft-entra-id")
    ) {
      const callbackUrl = url.searchParams.get("callbackUrl") || "/";
      if (isDevBypassEnabled() && (!provider?.clientId || !provider?.issuer)) {
        return NextResponse.redirect(new URL(callbackUrl, url.origin), { status: 302 });
      }
      const clientId = provider?.clientId ?? process.env.AUTH_MICROSOFT_ENTRA_ID_ID;
      const issuer = (provider?.issuer ?? process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER)?.replace(/\/$/, "");
      if (!clientId || !issuer) {
        return NextResponse.json(
          {
            error:
              "Microsoft Entra ID SSO is not configured. Set AUTH_SECRET, AUTH_MICROSOFT_ENTRA_ID_ID, AUTH_MICROSOFT_ENTRA_ID_SECRET, and AUTH_MICROSOFT_ENTRA_ID_ISSUER.",
          },
          { status: 500 },
        );
      }
      const secret = getSecret();
      const state = randomBytes(24).toString("base64url");
      const codeVerifier = randomBytes(32).toString("base64url");
      const codeChallenge = base64UrlSha256(codeVerifier);
      const redirectUri =
        process.env.AUTH_MICROSOFT_ENTRA_ID_REDIRECT_URI ||
        `${url.origin}/api/auth/callback/microsoft-entra-id`;

      // Entra ID v2.0 issuer ends with /v2.0; authorization endpoint is ../oauth2/v2.0/authorize
      const baseAuthorize = issuer.endsWith("/v2.0")
        ? `${issuer.slice(0, -5)}/oauth2/v2.0/authorize`
        : `${issuer}/oauth2/v2.0/authorize`;

      const authUrl = new URL(baseAuthorize);
      authUrl.searchParams.set("client_id", clientId);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("response_mode", "query");
      authUrl.searchParams.set("scope", "openid profile email");
      authUrl.searchParams.set("state", state);
      authUrl.searchParams.set("code_challenge", codeChallenge);
      authUrl.searchParams.set("code_challenge_method", "S256");

      const pkcePayload = encryptJwtPayload(
        {
          state,
          codeVerifier,
          callbackUrl,
          exp: Math.floor(Date.now() / 1000) + 600,
        },
        secret,
      );

      const res = NextResponse.redirect(authUrl, { status: 302 });
      res.cookies.set(PKCE_COOKIE, pkcePayload, {
        httpOnly: true,
        secure: isSecure,
        sameSite: "lax",
        path: "/api/auth",
        maxAge: 600,
      });
      return res;
    }

    if (
      (pathname.endsWith("/api/auth/callback/microsoft-entra-id") ||
        pathname.endsWith("/api/auth/callback/azure-ad") ||
        pathname.endsWith("/api/auth/callback")) &&
      req.method === "GET"
    ) {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const pkceRaw = req.cookies.get(PKCE_COOKIE)?.value;
      const secret = getSecret();

      if (!code || !state || !pkceRaw) {
        return NextResponse.redirect(new URL("/login?error=OAuthCallback", url.origin));
      }

      const pkceData = decryptJwtPayload(pkceRaw, secret);
      if (!pkceData || pkceData.state !== state || typeof pkceData.codeVerifier !== "string") {
        return NextResponse.redirect(new URL("/login?error=InvalidState", url.origin));
      }

      const clientId = provider?.clientId ?? process.env.AUTH_MICROSOFT_ENTRA_ID_ID;
      const clientSecret = provider?.clientSecret ?? process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET;
      const issuer = (provider?.issuer ?? process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER)?.replace(/\/$/, "");
      if (!clientId || !clientSecret || !issuer) {
        return NextResponse.redirect(new URL("/login?error=Configuration", url.origin));
      }

      const tokenEndpoint = issuer.endsWith("/v2.0")
        ? `${issuer.slice(0, -5)}/oauth2/v2.0/token`
        : `${issuer}/oauth2/v2.0/token`;

      const redirectUri =
        process.env.AUTH_MICROSOFT_ENTRA_ID_REDIRECT_URI ||
        `${url.origin}/api/auth/callback/microsoft-entra-id`;
      const tokenRes = await fetch(tokenEndpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          code_verifier: pkceData.codeVerifier,
        }),
      });

      if (!tokenRes.ok) {
        return NextResponse.redirect(new URL("/login?error=TokenExchange", url.origin));
      }

      const tokenJson = (await tokenRes.json()) as { id_token?: string; access_token?: string };
      const profile = tokenJson.id_token ? decodeJwtPayload(tokenJson.id_token) : {};
      const mappedUser = provider?.profile ? provider.profile(profile) : profile;

      let jwtPayload: JWT = {
        sub: typeof profile.sub === "string" ? profile.sub : undefined,
        name: typeof profile.name === "string" ? profile.name : undefined,
        email:
          typeof profile.email === "string"
            ? profile.email
            : typeof profile.preferred_username === "string"
              ? profile.preferred_username
              : undefined,
        oid:
          typeof profile.oid === "string"
            ? profile.oid
            : typeof profile.sub === "string"
              ? profile.sub
              : undefined,
        exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
      };

      if (config.callbacks?.jwt) {
        jwtPayload = await config.callbacks.jwt({
          token: jwtPayload,
          user: mappedUser,
          profile,
        });
      }

      const encryptedSession = encryptJwtPayload(jwtPayload, secret);
      const callbackUrl = typeof pkceData.callbackUrl === "string" ? pkceData.callbackUrl : "/";
      const res = NextResponse.redirect(new URL(callbackUrl, url.origin), { status: 302 });
      res.cookies.delete(PKCE_COOKIE);
      res.cookies.set(SESSION_COOKIE, encryptedSession, {
        httpOnly: true,
        secure: isSecure,
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_MAX_AGE_SECONDS,
      });
      return res;
    }

    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const auth = ((...args: unknown[]) => {
    // 1. Called with no arguments: `const session = await auth()`
    if (args.length === 0) {
      return (async () => {
        try {
          const { cookies } = await import("next/headers");
          const cookieStore = await cookies();
          const raw = cookieStore.get(SESSION_COOKIE)?.value;
          return await resolveSessionFromToken(raw, config);
        } catch {
          return isDevBypassEnabled() ? devBypassSession() : null;
        }
      })();
    }

    // 2. Called as wrapper in proxy.ts: `export const proxy = auth((req) => { ... })`
    // Must synchronously return a function so Next.js 16 recognizes `export const proxy`.
    if (typeof args[0] === "function") {
      const handler = args[0] as ProxyHandler;
      return async function proxy(request: NextRequest, context?: unknown) {
        const raw = request.cookies.get(SESSION_COOKIE)?.value;
        const session = await resolveSessionFromToken(raw, config);
        const authedReq = Object.assign(request, { auth: session }) as AuthenticatedNextRequest;
        const result = await handler(authedReq, context);
        return result ?? NextResponse.next();
      };
    }

    // 3. Called directly as `export const proxy = auth`
    return (async () => {
      const request = args[0] as NextRequest;
      const raw = request.cookies.get(SESSION_COOKIE)?.value;
      const session = await resolveSessionFromToken(raw, config);
      if (config.callbacks?.authorized) {
        const verdict = await config.callbacks.authorized({ request, auth: session });
        if (verdict instanceof Response) return verdict;
        if (!verdict) {
          if (request.nextUrl.pathname.startsWith("/api/")) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
          }
          return NextResponse.redirect(new URL("/login", request.nextUrl.origin));
        }
      }
      return NextResponse.next();
    })();
  }) as AuthFn;

  return {
    handlers: {
      GET: handleAuthRequest,
      POST: handleAuthRequest,
    },
    auth,
    signIn: async (_provider?: string, options?: { redirectTo?: string }) => {
      return options?.redirectTo ?? "/api/auth/signin/microsoft-entra-id";
    },
    signOut: async (options?: { redirectTo?: string }) => {
      return options?.redirectTo ?? "/api/auth/signout";
    },
  };
}
