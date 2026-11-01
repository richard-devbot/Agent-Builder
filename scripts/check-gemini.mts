/**
 * Connectivity check for the Discovery agent's Gemini setup, for when access
 * is granted. Run with the same environment as the server:
 *   GOOGLE_GENAI_USE_VERTEXAI=true GOOGLE_CLOUD_PROJECT=my-proj npm run intake:check
 */
import { z } from "zod";
import { generateStructured, intakeStatus } from "../lib/intake/gemini";

const status = intakeStatus();
console.log(status);
if (!status.configured) {
  console.error("Not configured. Set GEMINI_API_KEY, or GOOGLE_GENAI_USE_VERTEXAI=true + GOOGLE_CLOUD_PROJECT with OAuth credentials.");
  process.exit(1);
}
const started = Date.now();
const out = await generateStructured(
  z.object({ ok: z.boolean(), question: z.string() }),
  "You are a discovery analyst. Reply in JSON.",
  "Set ok=true and write one sharp follow-up question for: 'Our invoices are keyed into SAP by hand.'",
  512,
);
console.log(`OK in ${Date.now() - started} ms:`, out);
