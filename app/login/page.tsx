import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck, KeyRound, Lock, AlertTriangle } from "lucide-react";
import { auth, isDevBypassEnabled } from "@/auth";
import { siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in with company Microsoft Entra ID Single Sign-On.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const params = await searchParams;
  const callbackUrl = params.callbackUrl && params.callbackUrl.startsWith("/") ? params.callbackUrl : "/studio";
  const session = await auth();

  if (session?.user?.oid && !params.error) {
    redirect(callbackUrl);
  }

  const devBypass = isDevBypassEnabled();

  return (
    <div className="container-page flex min-h-[calc(100vh-8rem)] items-center justify-center py-12">
      <div className="surface w-full max-w-md space-y-6 p-6 sm:p-8">
        <div className="space-y-2">
          <span className="eyebrow inline-flex items-center gap-1.5">
            <Lock className="size-3.5 text-primary" aria-hidden /> Enterprise Single Sign-On
          </span>
          <h1 className="text-xl font-semibold tracking-tight">
            Sign in to {siteConfig.name}
          </h1>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Authenticate with your corporate Microsoft Entra ID account. Your role (Builder, Approver, or Admin) determines which deployment environments you can target.
          </p>
        </div>

        {params.error && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div>
              <p className="font-semibold">Sign-in could not be completed ({params.error})</p>
              <p className="mt-0.5 text-destructive/90">
                Verify your Microsoft Entra ID configuration or contact your platform administrator.
              </p>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <form action="/api/auth/signin/microsoft-entra-id" method="GET">
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
            <button
              type="submit"
              className="inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            >
              <KeyRound className="size-4" aria-hidden />
              Sign in with Microsoft Entra ID
            </button>
          </form>

          {devBypass && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
              <p className="font-semibold">Development Auth Bypass Active</p>
              <p className="mt-1">
                <code>AUTH_DEV_BYPASS=true</code> and <code>NODE_ENV=development</code> are active.
              </p>
              <Link
                href={callbackUrl}
                prefetch={false}
                className="mt-2 inline-flex font-semibold underline hover:no-underline"
              >
                Continue with local development bypass session →
              </Link>
            </div>
          )}
        </div>

        <div className="border-t border-border/60 pt-4 text-[11px] leading-relaxed text-muted-foreground">
          <p className="flex items-center gap-1.5 font-medium text-foreground/80">
            <ShieldCheck className="size-3.5 text-success" aria-hidden />
            Governed access control
          </p>
          <p className="mt-1">
            Sessions use encrypted httpOnly JWT cookies. No credentials or cloud keys are stored in your browser.
          </p>
        </div>
      </div>
    </div>
  );
}
