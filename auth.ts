/**
 * Platform SSO with Microsoft Entra ID (Auth.js / next-auth v5).
 *
 * Env variables (no defaults in code):
 * - AUTH_SECRET
 * - AUTH_MICROSOFT_ENTRA_ID_ID
 * - AUTH_MICROSOFT_ENTRA_ID_SECRET
 * - AUTH_MICROSOFT_ENTRA_ID_ISSUER (https://login.microsoftonline.com/<tenant-id>/v2.0)
 *
 * TODO(verify): Confirm the Entra App Registration manifest emits `oid` and
 * `roles` ("Builder" | "Approver" | "Admin") in the v2.0 ID token claims.
 */

import NextAuth, { isDevBypassEnabled, type AppRole, type Session } from "next-auth";
import MicrosoftEntraID, { type MicrosoftEntraIDProfile } from "next-auth/providers/microsoft-entra-id";
import { APP_ROLES, canDeployProd, parseAppRoles } from "@/lib/auth/roles";

export type { AppRole, Session };
export { APP_ROLES, canDeployProd, isDevBypassEnabled, parseAppRoles };

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
      profile(profile: MicrosoftEntraIDProfile) {
        return {
          id: profile.oid ?? profile.sub ?? "",
          name: profile.name ?? "",
          email: profile.email ?? profile.preferred_username ?? "",
          oid: profile.oid ?? profile.sub ?? "",
          roles: parseAppRoles(profile.roles),
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user, profile }) {
      if (profile) {
        token.oid =
          typeof profile.oid === "string"
            ? profile.oid
            : typeof profile.sub === "string"
              ? profile.sub
              : token.oid;
        token.roles = parseAppRoles(profile.roles);
        token.name = typeof profile.name === "string" ? profile.name : token.name;
        token.email =
          typeof profile.email === "string"
            ? profile.email
            : typeof profile.preferred_username === "string"
              ? profile.preferred_username
              : token.email;
      } else if (user) {
        if (typeof user.oid === "string") token.oid = user.oid;
        if (Array.isArray(user.roles)) token.roles = parseAppRoles(user.roles);
      }
      if (!token.roles) {
        token.roles = ["Builder"];
      }
      return token;
    },
    session({ session, token }) {
      return {
        ...session,
        user: {
          ...session.user,
          name: typeof token.name === "string" ? token.name : session.user.name,
          email: typeof token.email === "string" ? token.email : session.user.email,
          oid: typeof token.oid === "string" ? token.oid : session.user.oid,
          roles: parseAppRoles(token.roles),
        },
      };
    },
  },
});
