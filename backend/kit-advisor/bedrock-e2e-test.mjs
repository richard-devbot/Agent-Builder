// E2E test: built Lambda bundle against a local Bedrock Converse stub.
import http from "node:http";

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

let captured = null;

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    captured = { method: req.method, url: req.url, body: JSON.parse(body) };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        output: { message: { role: "assistant", content: [{ text: ADVICE_JSON }] } },
        stopReason: "end_turn",
      }),
    );
  });
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));

process.env.BEDROCK_ENDPOINT_URL = `http://127.0.0.1:${server.address().port}`;
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
  projectType: "legacy-migration",
  answers: { "legacy-source": "COBOL / mainframe" },
  draftMarkdown: "# CLAUDE.md\n\n## Project profile\n- Stack: Java",
};

let failures = 0;
const check = (label, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}: ${label}${cond ? "" : " — " + detail}`);
  if (!cond) failures++;
};

const res = await handler(event(validInput));
check("handler returns 200", res.statusCode === 200, `got ${res.statusCode} ${res.body}`);
const advice = res.statusCode === 200 ? JSON.parse(res.body).advice : {};
check(
  "advice parsed against the shared schema",
  advice.suggestions?.[0]?.severity === "recommended" && advice.missingAnswers?.length === 1,
  JSON.stringify(advice),
);
check(
  "Bedrock stub hit at /model/<modelId>/converse",
  captured?.url === `/model/${encodeURIComponent(process.env.BEDROCK_MODEL_ID)}/converse`,
  captured?.url,
);
check(
  "prompt carries stack, answers, and draft",
  captured?.body?.messages?.[0]?.content?.[0]?.text?.includes("java, spring") &&
    captured?.body?.messages?.[0]?.content?.[0]?.text?.includes("COBOL / mainframe") &&
    captured?.body?.messages?.[0]?.content?.[0]?.text?.includes("## Project profile"),
);

server.close();
process.exit(failures ? 1 : 0);
