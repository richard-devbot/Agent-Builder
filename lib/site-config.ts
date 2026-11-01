const DEFAULT_LOCAL_URL = "http://localhost:3000";

export const siteConfig = {
  name: "Agent Builder",
  shortName: "Agent Builder",
  edition: "AI Centre of Excellence",
  author: "Richardson & Team",
  tagline: "Governed AI development kits, playbooks and cloud deployment, standardised across every team.",
  description:
    "The AI Centre of Excellence toolkit: build governed agent kits for Claude Code, Copilot, Cursor and Gemini, follow modernization playbooks, and package Google ADK deployments.",
  url: process.env.SITE_URL?.trim().replace(/\/$/, "") || DEFAULT_LOCAL_URL,
} as const;

export function claudeCodeOpenUrl(promptText: string): string {
  return `https://claude.ai/code?prompt=${encodeURIComponent(promptText)}`;
}
