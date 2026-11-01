// E2E test: built Lambda bundle against a local Bedrock Converse stub.
import http from "node:http";

const SKILL_MD = `---
name: petstore-api-conventions
description: Apply the Petstore team's REST conventions when writing endpoints.
---

## When to use
When adding or changing API endpoints.
`;

let captured = null;

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    captured = {
      method: req.method,
      url: req.url,
      auth: req.headers["authorization"],
      body: JSON.parse(body),
    };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        output: { message: { role: "assistant", content: [{ text: SKILL_MD }] } },
        stopReason: "end_turn",
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      }),
    );
  });
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

process.env.BEDROCK_ENDPOINT_URL = `http://127.0.0.1:${port}`;
process.env.BEDROCK_REGION = "us-east-1";
process.env.BEDROCK_MODEL_ID = "us.amazon.nova-pro-v1:0";
process.env.AWS_ACCESS_KEY_ID = "test-access-key";
process.env.AWS_SECRET_ACCESS_KEY = "test-secret-key";

const { handler } = await import("./dist/index.mjs");

const event = (body, method = "POST") => ({
  body: JSON.stringify(body),
  requestContext: { http: { method } },
});

const validInput = {
  technologies: ["java", "spring"],
  projectName: "Petstore",
  document: { name: "conventions.md", text: "Use plural nouns for all resources." },
};

let failures = 0;
const check = (label, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}: ${label}${cond ? "" : " — " + detail}`);
  if (!cond) failures++;
};

// Positive path
const res = await handler(event(validInput));
check("handler returns 200", res.statusCode === 200, `got ${res.statusCode} ${res.body}`);
const skill = res.statusCode === 200 ? JSON.parse(res.body).skill : {};
check("skill.name parsed from Bedrock response", skill.name === "petstore-api-conventions", JSON.stringify(skill));
check(
  "stub hit at /model/<modelId>/converse",
  captured?.method === "POST" &&
    captured?.url === `/model/${encodeURIComponent(process.env.BEDROCK_MODEL_ID)}/converse`,
  captured?.url,
);
check(
  "request is SigV4-signed for bedrock",
  /^AWS4-HMAC-SHA256 Credential=test-access-key\/\d+\/us-east-1\/bedrock\//.test(captured?.auth ?? ""),
  captured?.auth,
);
check("system prompt sent", captured?.body?.system?.[0]?.text?.includes("SKILL.md"));
check(
  "user prompt carries document text + stack",
  captured?.body?.messages?.[0]?.content?.[0]?.text?.includes("Use plural nouns for all resources.") &&
    captured?.body?.messages?.[0]?.content?.[0]?.text?.includes("java, spring"),
);
check(
  "inference config set",
  captured?.body?.inferenceConfig?.maxTokens === 4096 &&
    captured?.body?.inferenceConfig?.temperature === 0.3,
  JSON.stringify(captured?.body?.inferenceConfig),
);

// Negative path: stub returning empty output -> 502
server.removeAllListeners("request");
server.on("request", (req, res) => {
  req.resume();
  req.on("end", () => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ output: { message: { role: "assistant", content: [] } } }));
  });
});
const res502 = await handler(event(validInput));
check("returns 502 when model returns no text", res502.statusCode === 502, `got ${res502.statusCode}`);

server.close();
process.exit(failures ? 1 : 0);
