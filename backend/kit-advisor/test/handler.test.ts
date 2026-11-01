import { test } from "node:test";
import assert from "node:assert/strict";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import {
  createHandler,
  parseAdvice,
  buildUserPrompt,
  type LlmClient,
} from "../index";

const ADVICE_JSON = JSON.stringify({
  suggestions: [
    {
      title: "Pin the Java version",
      detail: "The draft never states a JDK version; add it to the profile.",
      severity: "recommended",
    },
  ],
  missingAnswers: ["Which build tool does the project use?"],
});

function fakeLlm(output: string): LlmClient {
  return { generate: async () => output };
}

function event(body: unknown, method = "POST"): APIGatewayProxyEventV2 {
  return {
    body: typeof body === "string" ? body : JSON.stringify(body),
    requestContext: { http: { method } },
  } as APIGatewayProxyEventV2;
}

const validInput = {
  technologies: ["java", "spring"],
  projectType: "legacy-migration",
  answers: { "legacy-source": "COBOL / mainframe" },
  draftMarkdown: "# CLAUDE.md\n\n## Project profile\n- Stack: Java",
};

test("returns advice for valid input", async () => {
  const res = (await createHandler(fakeLlm(ADVICE_JSON))(
    event(validInput),
  )) as { statusCode: number; body: string };
  assert.equal(res.statusCode, 200);
  const { advice } = JSON.parse(res.body);
  assert.equal(advice.suggestions[0].severity, "recommended");
  assert.equal(advice.missingAnswers.length, 1);
});

test("parseAdvice strips code fences", () => {
  const a = parseAdvice("```json\n" + ADVICE_JSON + "\n```");
  assert.equal(a.suggestions[0].title, "Pin the Java version");
});

test("parseAdvice rejects wrong shapes", () => {
  assert.throws(() => parseAdvice("not json"));
  assert.throws(() =>
    parseAdvice(JSON.stringify({ suggestions: [{ title: "x" }] })),
  );
  assert.throws(() =>
    parseAdvice(
      JSON.stringify({
        suggestions: [{ title: "x", detail: "y", severity: "critical" }],
        missingAnswers: [],
      }),
    ),
  );
});

test("prompt carries stack, answers, and draft", () => {
  const p = buildUserPrompt(validInput);
  assert.match(p, /java, spring/);
  assert.match(p, /legacy-source: COBOL \/ mainframe/);
  assert.match(p, /## Project profile/);
});

test("rejects invalid input with 400", async () => {
  const res = (await createHandler(fakeLlm(ADVICE_JSON))(
    event({ technologies: [] }),
  )) as { statusCode: number };
  assert.equal(res.statusCode, 400);
});

test("returns 502 on malformed model output", async () => {
  const res = (await createHandler(fakeLlm("nope"))(
    event(validInput),
  )) as { statusCode: number };
  assert.equal(res.statusCode, 502);
});

test("non-POST is 405, OPTIONS is 204", async () => {
  const h = createHandler(fakeLlm(ADVICE_JSON));
  assert.equal(
    ((await h(event(validInput, "GET"))) as { statusCode: number }).statusCode,
    405,
  );
  assert.equal(
    ((await h(event(validInput, "OPTIONS"))) as { statusCode: number }).statusCode,
    204,
  );
});
