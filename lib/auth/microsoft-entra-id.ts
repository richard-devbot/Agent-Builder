/**
 * Microsoft Entra ID OIDC provider definition for Auth.js (next-auth v5).
 *
 * TODO(verify): Confirm exact claim names emitted by your tenant's Entra ID v2.0
 * ID token and userinfo endpoint (`oid`, `roles`, `preferred_username`).
 */

export interface MicrosoftEntraIDProfile extends Record<string, unknown> {
  sub?: string;
  oid?: string;
  name?: string;
  email?: string;
  preferred_username?: string;
  roles?: string[];
}

export interface MicrosoftEntraIDConfig<P = MicrosoftEntraIDProfile> {
  id: "microsoft-entra-id";
  name: "Microsoft Entra ID";
  type: "oidc";
  clientId?: string;
  clientSecret?: string;
  issuer?: string;
  profile?: (profile: P) => Record<string, unknown>;
}

export default function MicrosoftEntraID<P = MicrosoftEntraIDProfile>(
  options: {
    clientId?: string;
    clientSecret?: string;
    issuer?: string;
    profile?: (profile: P) => Record<string, unknown>;
  } = {},
): MicrosoftEntraIDConfig<P> {
  return {
    id: "microsoft-entra-id",
    name: "Microsoft Entra ID",
    type: "oidc",
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    issuer: options.issuer,
    profile: options.profile,
  };
}
