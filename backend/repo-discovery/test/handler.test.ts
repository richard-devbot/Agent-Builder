import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import {
  createHandler,
  parseGithubUrl,
  parseDiscovery,
  buildUserPrompt,
  type LlmClient,
} from "../index";

const DISCOVERY_JSON = JSON.stringify({
  projectContextMarkdown: "## Overview\nA Java Spring service.",
  suggestedTechnologies: ["Java", "spring"],
  summary: "A Spring Boot billing service.",
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

/** Local GitHub API stub serving a tree and one manifest file. */
async function withGithubStub(fn: () => Promise<void>) {
  const server = http.createServer((req, res) => {
    if (req.url?.includes("/git/trees/")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          tree: [
            { path: "pom.xml", type: "blob" },
            { path: "src/main/java/App.java", type: "blob" },
            { path: "src", type: "tree" },
          ],
        }),
      );
    } else if (req.url?.includes("/contents/pom.xml")) {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("<project><artifactId>billing</artifactId></project>");
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  process.env.GITHUB_API_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    await fn();
  } finally {
    delete process.env.GITHUB_API_URL;
    server.close();
  }
}

test("parses owner/repo from GitHub URLs", () => {
  assert.deepEqual(parseGithubUrl("https://github.com/acme/billing"), {
    owner: "acme",
    repo: "billing",
  });
  assert.deepEqual(parseGithubUrl("https://github.com/acme/billing.git"), {
    owner: "acme",
    repo: "billing",
  });
  assert.throws(() => parseGithubUrl("https://gitlab.com/acme/billing"));
});

test("returns discovery for a valid repo", async () => {
  await withGithubStub(async () => {
    const res = (await createHandler(fakeLlm(DISCOVERY_JSON))(
      event({ repoUrl: "https://github.com/acme/billing" }),
    )) as { statusCode: number; body: string };
    assert.equal(res.statusCode, 200);
    const { discovery } = JSON.parse(res.body);
    assert.match(discovery.projectContextMarkdown, /## Overview/);
    assert.deepEqual(discovery.suggestedTechnologies, ["java", "spring"]);
    assert.match(discovery.summary, /Spring Boot/);
  });
});

test("prompt carries the file tree and manifest contents", async () => {
  await withGithubStub(async () => {
    let prompt = "";
    const llm: LlmClient = {
      generate: async (_s, u) => ((prompt = u), DISCOVERY_JSON),
    };
    await createHandler(llm)(event({ repoUrl: "https://github.com/acme/billing" }));
    assert.match(prompt, /acme\/billing/);
    assert.match(prompt, /src\/main\/java\/App\.java/);
    assert.match(prompt, /<artifactId>billing<\/artifactId>/);
  });
});

test("request githubToken is sent as Authorization header and beats env", async () => {
  const seen: string[] = [];
  const server = http.createServer((req, res) => {
    seen.push(req.headers.authorization ?? "");
    if (req.url?.includes("/git/trees/")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ tree: [{ path: "pom.xml", type: "blob" }] }));
    } else {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("<project/>");
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  process.env.GITHUB_API_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.GITHUB_TOKEN = "env-token";
  try {
    const res = (await createHandler(fakeLlm(DISCOVERY_JSON))(
      event({
        repoUrl: "https://github.com/acme/billing",
        githubToken: "user-token",
      }),
    )) as { statusCode: number };
    assert.equal(res.statusCode, 200);
    assert.ok(seen.length > 0);
    for (const auth of seen) assert.equal(auth, "Bearer user-token");
  } finally {
    delete process.env.GITHUB_API_URL;
    delete process.env.GITHUB_TOKEN;
    server.close();
  }
});

test("rejects non-GitHub URLs with 422", async () => {
  const res = (await createHandler(fakeLlm(DISCOVERY_JSON))(
    event({ repoUrl: "https://gitlab.com/acme/billing" }),
  )) as { statusCode: number };
  assert.equal(res.statusCode, 422);
});

test("rejects invalid input with 400", async () => {
  const bad = (await createHandler(fakeLlm(DISCOVERY_JSON))(
    event({ repoUrl: "not-a-url" }),
  )) as { statusCode: number };
  assert.equal(bad.statusCode, 400);
  const noJson = (await createHandler(fakeLlm(DISCOVERY_JSON))(
    event("not json"),
  )) as { statusCode: number };
  assert.equal(noJson.statusCode, 400);
});

test("returns 502 on malformed model output", async () => {
  await withGithubStub(async () => {
    const res = (await createHandler(fakeLlm("not json at all"))(
      event({ repoUrl: "https://github.com/acme/billing" }),
    )) as { statusCode: number };
    assert.equal(res.statusCode, 502);
  });
});

test("parseDiscovery strips code fences and lowercases tech ids", () => {
  const fenced = "```json\n" + DISCOVERY_JSON + "\n```";
  const d = parseDiscovery(fenced);
  assert.deepEqual(d.suggestedTechnologies, ["java", "spring"]);
});

test("non-POST is 405, OPTIONS is 204", async () => {
  const h = createHandler(fakeLlm(DISCOVERY_JSON));
  assert.equal(
    ((await h(event({}, "GET"))) as { statusCode: number }).statusCode,
    405,
  );
  assert.equal(
    ((await h(event({}, "OPTIONS"))) as { statusCode: number }).statusCode,
    204,
  );
});

test("buildUserPrompt lists tree paths", () => {
  const p = buildUserPrompt({
    owner: "acme",
    repo: "billing",
    paths: ["a.ts", "b.ts"],
    files: [{ path: "package.json", text: "{}" }],
  });
  assert.match(p, /- a\.ts/);
  assert.match(p, /<file path="package\.json">/);
});
