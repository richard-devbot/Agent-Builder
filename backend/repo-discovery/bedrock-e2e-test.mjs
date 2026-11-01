// E2E test: built Lambda bundle against local Bedrock Converse + GitHub API stubs.
import http from "node:http";

const DISCOVERY_JSON = JSON.stringify({
  projectContextMarkdown: "## Overview\nA Java Spring billing service.",
  suggestedTechnologies: ["java", "spring"],
  summary: "A Spring Boot billing service.",
});

let bedrockCaptured = null;

const bedrock = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    bedrockCaptured = { method: req.method, url: req.url, body: JSON.parse(body) };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        output: { message: { role: "assistant", content: [{ text: DISCOVERY_JSON }] } },
        stopReason: "end_turn",
      }),
    );
  });
});

const github = http.createServer((req, res) => {
  if (req.url?.includes("/git/trees/")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        tree: [
          { path: "pom.xml", type: "blob" },
          { path: "src/main/java/App.java", type: "blob" },
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

await Promise.all([
  new Promise((r) => bedrock.listen(0, "127.0.0.1", r)),
  new Promise((r) => github.listen(0, "127.0.0.1", r)),
]);

process.env.BEDROCK_ENDPOINT_URL = `http://127.0.0.1:${bedrock.address().port}`;
process.env.GITHUB_API_URL = `http://127.0.0.1:${github.address().port}`;
process.env.BEDROCK_REGION = "us-east-1";
process.env.BEDROCK_MODEL_ID = "us.amazon.nova-pro-v1:0";
process.env.AWS_ACCESS_KEY_ID = "test-access-key";
process.env.AWS_SECRET_ACCESS_KEY = "test-secret-key";

const { handler } = await import("./dist/index.mjs");

const event = (body, method = "POST") => ({
  body: JSON.stringify(body),
  requestContext: { http: { method } },
});

let failures = 0;
const check = (label, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}: ${label}${cond ? "" : " — " + detail}`);
  if (!cond) failures++;
};

const res = await handler(event({ repoUrl: "https://github.com/acme/billing" }));
check("handler returns 200", res.statusCode === 200, `got ${res.statusCode} ${res.body}`);
const discovery = res.statusCode === 200 ? JSON.parse(res.body).discovery : {};
check(
  "project context + techs parsed",
  discovery.projectContextMarkdown?.includes("## Overview") &&
    JSON.stringify(discovery.suggestedTechnologies) === '["java","spring"]',
  JSON.stringify(discovery),
);
check(
  "Bedrock stub hit at /model/<modelId>/converse",
  bedrockCaptured?.url ===
    `/model/${encodeURIComponent(process.env.BEDROCK_MODEL_ID)}/converse`,
  bedrockCaptured?.url,
);
check(
  "prompt carries tree + manifest",
  bedrockCaptured?.body?.messages?.[0]?.content?.[0]?.text?.includes("src/main/java/App.java") &&
    bedrockCaptured?.body?.messages?.[0]?.content?.[0]?.text?.includes("<artifactId>billing</artifactId>"),
);

const res422 = await handler(event({ repoUrl: "https://gitlab.com/acme/billing" }));
check("non-GitHub URL returns 422", res422.statusCode === 422, `got ${res422.statusCode}`);

bedrock.close();
github.close();
process.exit(failures ? 1 : 0);
