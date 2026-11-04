/**
 * Isomorphic (client + server safe) role types and helpers for Microsoft Entra ID
 * platform SSO.
 */

export type AppRole = "Builder" | "Approver" | "Admin";

export interface SessionUser {
  id?: string;
  name: string;
  email: string;
  oid: string;
  roles: AppRole[];
}

export interface Session {
  user: SessionUser;
  expires: string;
  devBypass?: boolean;
}

export const APP_ROLES: readonly AppRole[] = ["Builder", "Approver", "Admin"] as const;

export function parseAppRoles(raw: unknown): AppRole[] {
  if (!Array.isArray(raw)) return ["Builder"];
  const valid = raw.filter(
    (r): r is AppRole => typeof r === "string" && (APP_ROLES as readonly string[]).includes(r),
  );
  return valid.length > 0 ? valid : ["Builder"];
}

/** UI helper: only Approver and Admin roles can select the `prod` cloud environment. */
export function canDeployProd(roles: readonly AppRole[] | undefined): boolean {
  if (!roles) return false;
  return roles.includes("Approver") || roles.includes("Admin");
}
