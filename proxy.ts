/**
 * Next.js 16 route protection via `proxy.ts` (replaces `middleware.ts`).
 *
 * Protects EVERY page and `/api/*` route except `/api/auth/*` and `/login`.
 * - Unauthenticated `/api/*` requests -> 401 JSON
 * - Unauthenticated page requests -> redirect to `/login`
 *
 * TODO(verify): Confirm the exact Auth.js v5 export convention for Next.js 16
 * `proxy.ts` (`export const proxy = auth(...)` vs wrapping inside `export async function proxy(req)`).
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";

export const proxy = auth((req) => {
  const { pathname, search } = req.nextUrl;

  // Public auth endpoints and login page
  if (pathname.startsWith("/api/auth/") || pathname === "/api/auth" || pathname === "/login") {
    return NextResponse.next();
  }

  const session = req.auth;
  if (!session?.user?.oid) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Authentication required. Sign in with Microsoft Entra ID." },
        { status: 401, headers: { "cache-control": "no-store" } },
      );
    }
    const loginUrl = new URL("/login", req.nextUrl.origin);
    const callbackUrl = `${pathname}${search}`;
    if (callbackUrl && callbackUrl !== "/") {
      loginUrl.searchParams.set("callbackUrl", callbackUrl);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
