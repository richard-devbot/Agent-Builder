/**
 * AES-256-GCM encryption and httpOnly cookie helpers for GitLab OAuth 2.0 tokens.
 *
 * Security invariant:
 * - Encrypts `{ access_token, refresh_token, expires_at }` with AES-256-GCM using
 *   `GITLAB_TOKEN_ENC_KEY`.
 * - Stored ONLY in an `httpOnly`, `Secure`, `SameSite=Lax` cookie scoped to
 *   `/api/gitlab`.
 * - NEVER written to `.env`, `localStorage`, logs, or client-accessible JS.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

export const GITLAB_TOKEN_COOKIE = "ab_gitlab_tokens";
export const GITLAB_PKCE_COOKIE = "ab_gitlab_pkce";
export const GITLAB_COOKIE_PATH = "/api/gitlab";

export interface GitLabTokenSet {
  access_token: string;
  refresh_token: string;
  expires_at: number; // epoch milliseconds
}

export interface GitLabPkceState {
  state: string;
  code_verifier: string;
  returnTo: string;
  created_at: number;
}

function deriveAes256Key(rawKey: string): Buffer {
  const trimmed = rawKey.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }
  return createHash("sha256").update(trimmed, "utf8").digest();
}

export function encryptAes256Gcm(payload: unknown, rawKey: string): string {
  const key = deriveAes256Key(rawKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${encrypted.toString("base64url")}.${authTag.toString("base64url")}`;
}

export function decryptAes256Gcm<T>(ciphertext: string, rawKey: string): T | null {
  try {
    const parts = ciphertext.split(".");
    if (parts.length !== 3) return null;
    const [ivB64, ctB64, tagB64] = parts;
    const key = deriveAes256Key(rawKey);
    const iv = Buffer.from(ivB64, "base64url");
    const ct = Buffer.from(ctB64, "base64url");
    const authTag = Buffer.from(tagB64, "base64url");
    if (iv.length !== 12 || authTag.length !== 16) return null;
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ct), decipher.final()]);
    return JSON.parse(decrypted.toString("utf8")) as T;
  } catch {
    return null;
  }
}

export function encryptGitLabTokens(tokens: GitLabTokenSet, rawKey: string): string {
  return encryptAes256Gcm(tokens, rawKey);
}

export function decryptGitLabTokens(cookieValue: string, rawKey: string): GitLabTokenSet | null {
  const data = decryptAes256Gcm<Partial<GitLabTokenSet>>(cookieValue, rawKey);
  if (
    !data ||
    typeof data.access_token !== "string" ||
    typeof data.refresh_token !== "string" ||
    typeof data.expires_at !== "number"
  ) {
    return null;
  }
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
  };
}

export function setGitLabTokenCookie(
  res: NextResponse,
  tokens: GitLabTokenSet,
  rawKey: string,
): void {
  const encrypted = encryptGitLabTokens(tokens, rawKey);
  res.cookies.set(GITLAB_TOKEN_COOKIE, encrypted, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: GITLAB_COOKIE_PATH,
    maxAge: 60 * 60 * 24 * 14, // 14 days (refresh token lifecycle)
  });
}

export function clearGitLabTokenCookie(res: NextResponse): void {
  res.cookies.set(GITLAB_TOKEN_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: GITLAB_COOKIE_PATH,
    maxAge: 0,
  });
}

export function readGitLabTokensFromRequest(
  req: NextRequest,
  rawKey: string,
): GitLabTokenSet | null {
  const raw = req.cookies.get(GITLAB_TOKEN_COOKIE)?.value;
  if (!raw) return null;
  return decryptGitLabTokens(raw, rawKey);
}
