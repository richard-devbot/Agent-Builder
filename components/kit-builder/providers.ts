import type { Provider } from "@/lib/kit/build-kit";

/** Display metadata for each target assistant (labels live in PROVIDER_LABEL). */
export const PROVIDERS: { id: Provider; glyph: string; blurb: string }[] = [
  { id: "claude-code", glyph: "CC", blurb: ".claude/ folder + CLAUDE.md" },
  { id: "copilot", glyph: "GH", blurb: ".github/ instructions, agents & prompts" },
  { id: "cursor", glyph: "Cu", blurb: ".cursor/rules/*.mdc + AGENTS.md" },
  { id: "gemini-cli", glyph: "Gm", blurb: ".gemini/ plugin + GEMINI.md (CLI)" },
  { id: "google-adk", glyph: "AD", blurb: "Google ADK agent.py + specialists/ + tools/" },
];

export const PROVIDER_META = Object.fromEntries(PROVIDERS.map((p) => [p.id, p])) as Record<
  Provider,
  (typeof PROVIDERS)[number]
>;
