/**
 * Gemini models offered for ADK agents. Each answered a live call through a
 * Vertex AI express-mode key (location global) on 2026-11-01; Pro/Argon
 * models returned 404 for that project, so they aren't listed. Agents can
 * still be set to any other model id in agent.py.
 */
export const ADK_MODELS = [
  { id: "gemini-3.8-flash", note: "Default · multi-step orchestration and tool use" },
  { id: "gemini-3.5-flash", note: "Balanced quality and speed" },
  { id: "gemini-3.5-flash-lite", note: "Fastest and cheapest · simple extraction" },
  { id: "gemini-3.1-flash-lite", note: "Previous lite generation" },
] as const;
