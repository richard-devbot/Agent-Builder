import { test } from "node:test";
import assert from "node:assert/strict";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import {
  createHandler,
  parseSkillMarkdown,
  buildUserPrompt,
  type LlmClient,
} from "../index";

const SKILL_MD = `---
name: petstore-api-conventions
description: Apply the Petstore team's REST conventions when writing endpoints.
---

## When to use
When adding or changing API endpoints.

## Steps
1. Use plural nouns for resources.
`;

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
  projectName: "Petstore",
  document: { name: "conventions.md", text: "Use plural nouns." },
};

test("returns a parsed skill for valid input", async () => {
  const res = await createHandler(fakeLlm(SKILL_MD))(event(validInput));
  assert.equal(typeof res, "object");
  const r = res as { statusCode: number; body: string };
  assert.equal(r.statusCode, 200);
  const { skill } = JSON.parse(r.body);
  assert.equal(skill.name, "petstore-api-conventions");
  assert.match(skill.description, /REST conventions/);
  assert.match(skill.markdown, /^---\nname:/);
});

test("strips a markdown code fence around the model output", () => {
  const fenced = "```markdown\n" + SKILL_MD.trim() + "\n```";
  const skill = parseSkillMarkdown(fenced);
  assert.equal(skill.name, "petstore-api-conventions");
});

test("rejects invalid JSON with 400", async () => {
  const res = (await createHandler(fakeLlm(SKILL_MD))(
    event("not json"),
  )) as { statusCode: number };
  assert.equal(res.statusCode, 400);
});

test("rejects missing document with 400", async () => {
  const res = (await createHandler(fakeLlm(SKILL_MD))(
    event({ technologies: [] }),
  )) as { statusCode: number };
  assert.equal(res.statusCode, 400);
});

test("returns 502 when the model output has no frontmatter", async () => {
  const res = (await createHandler(fakeLlm("no frontmatter here"))(
    event(validInput),
  )) as { statusCode: number };
  assert.equal(res.statusCode, 502);
});

test("rejects non-POST with 405 and answers OPTIONS with 204", async () => {
  const h = createHandler(fakeLlm(SKILL_MD));
  const get = (await h(event(validInput, "GET"))) as { statusCode: number };
  assert.equal(get.statusCode, 405);
  const opt = (await h(event(validInput, "OPTIONS"))) as { statusCode: number };
  assert.equal(opt.statusCode, 204);
});

test("prompt includes stack, notes, and document text", () => {
  const p = buildUserPrompt({
    technologies: ["dotnet"],
    notes: "Never touch /v1.",
    document: { name: "doc.md", text: "PetaPoco only." },
  });
  assert.match(p, /dotnet/);
  assert.match(p, /Never touch \/v1\./);
  assert.match(p, /PetaPoco only\./);
});
