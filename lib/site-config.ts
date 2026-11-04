import { publicConfig } from "@/lib/config/public";

export const siteConfig = {
  name: publicConfig.appName,
  shortName: publicConfig.appName,
  edition: publicConfig.appEdition,
  author: publicConfig.orgName || publicConfig.appName,
  tagline: "Governed AI development kits, playbooks and cloud deployment, standardised across every team.",
  description:
    "The enterprise AI toolkit: build governed agent kits, follow modernization playbooks, and deploy Google ADK agents via Workload Identity Federation.",
  url: publicConfig.siteUrl,
} as const;

export function claudeCodeOpenUrl(promptText: string): string {
  return `https://claude.ai/code?prompt=${encodeURIComponent(promptText)}`;
}
