/**
 * repo-discovery Lambda — single-file implementation.
 *
 * POST /repo-discovery — analyzes a public GitHub repository server-side and
 * returns a project-context.md draft, suggested technology ids for the wizard,
 * and a summary. Reads the repo through the GitHub REST API (no git binary),
 * then asks the AWS Bedrock Converse API to synthesize the context document.
 *
 * Runtime environment variables:
 *   BEDROCK_MODEL_ID     model or inference-profile id
 *                        (default: us.amazon.nova-pro-v1:0)
 *   BEDROCK_REGION       region for Bedrock calls (default: Lambda's AWS_REGION)
 *   BEDROCK_ENDPOINT_URL optional endpoint override (used by local stub tests)
 *   GITHUB_API_URL       optional GitHub API base override (stub tests)
 *   GITHUB_TOKEN         optional fallback token (rate limits / private repos);
 *                        a githubToken in the request body takes precedence
 *   ALLOWED_ORIGIN       CORS origin (default: *)
 *
 * IAM: the Lambda execution role needs `bedrock:InvokeModel`.
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { RepoDiscoveryRequestSchema } from "../../contracts/repo-discovery";

/* ── LLM (AWS Bedrock, Converse API) ── */

export interface LlmClient {
  generate(system: string, user: string): Promise<string>;
}

export class BedrockLlm implements LlmClient {
  private client: BedrockRuntimeClient;
  private modelId: string;

  constructor() {
    this.client = new BedrockRuntimeClient({
      region: process.env.BEDROCK_REGION || process.env.AWS_REGION || "us-east-1",
      ...(process.env.BEDROCK_ENDPOINT_URL
        ? {
            endpoint: process.env.BEDROCK_ENDPOINT_URL,
            requestHandler: new NodeHttpHandler(),
          }
        : {}),
    });
    this.modelId =
      process.env.BEDROCK_MODEL_ID ?? "us.amazon.nova-pro-v1:0";
  }

  async generate(system: string, user: string): Promise<string> {
    const res = await this.client.send(
      new ConverseCommand({
        modelId: this.modelId,
        system: [{ text: system }],
        messages: [{ role: "user", content: [{ text: user }] }],
        inferenceConfig: { maxTokens: 4096, temperature: 0.2 },
      }),
    );
    const text = res.output?.message?.content
      ?.map((b) => ("text" in b ? b.text : ""))
      .join("");
    if (!text) throw new Error("Model returned no text");
    return text;
  }
}

/* ── Repository reading (GitHub REST API) ── */

/** Manifest / entry files worth feeding to the model, by exact name. */
const KEY_FILES = new Set([
  "package.json",
  "pyproject.toml",
  "requirements.txt",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "go.mod",
  "cargo.toml",
  "gemfile",
  "composer.json",
  "dockerfile",
  "docker-compose.yml",
  "docker-compose.yaml",
  "makefile",
  "readme.md",
  "csproj",
]);

const MAX_TREE_PATHS = 400;
const MAX_FILE_CHARS = 12_000;
const MAX_KEY_FILES = 8;

export type RepoSnapshot = {
  owner: string;
  repo: string;
  paths: string[];
  files: { path: string; text: string }[];
};

export function parseGithubUrl(repoUrl: string): { owner: string; repo: string } {
  const m = repoUrl.match(
    /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/,
  );
  if (!m) throw new Error("Only GitHub repository URLs are supported");
  return { owner: m[1], repo: m[2] };
}

function isKeyFile(path: string): boolean {
  const base = path.split("/").pop()?.toLowerCase() ?? "";
  return KEY_FILES.has(base) || base.endsWith(".csproj") || base.endsWith(".sln");
}

export async function fetchRepoSnapshot(
  repoUrl: string,
  ref?: string,
  githubToken?: string,
): Promise<RepoSnapshot> {
  const { owner, repo } = parseGithubUrl(repoUrl);
  const api = (process.env.GITHUB_API_URL ?? "https://api.github.com").replace(/\/+$/, "");
  const token = githubToken || process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "sdlc-playbook-repo-discovery",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const treeRes = await fetch(
    `${api}/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref ?? "HEAD")}?recursive=1`,
    { headers },
  );
  if (!treeRes.ok) {
    throw new Error(`GitHub tree fetch failed (${treeRes.status})`);
  }
  const tree = (await treeRes.json()) as {
    tree?: { path: string; type: string }[];
  };
  const blobs = (tree.tree ?? []).filter((e) => e.type === "blob");
  const paths = blobs.map((e) => e.path).slice(0, MAX_TREE_PATHS);

  // Prefer key files closest to the repo root.
  const keyPaths = blobs
    .map((e) => e.path)
    .filter(isKeyFile)
    .sort((a, b) => a.split("/").length - b.split("/").length)
    .slice(0, MAX_KEY_FILES);

  const files: { path: string; text: string }[] = [];
  for (const path of keyPaths) {
    const res = await fetch(
      `${api}/repos/${owner}/${repo}/contents/${path}${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`,
      { headers: { ...headers, Accept: "application/vnd.github.raw+json" } },
    );
    if (!res.ok) continue;
    const text = (await res.text()).slice(0, MAX_FILE_CHARS);
    files.push({ path, text });
  }

  return { owner, repo, paths, files };
}

/* ── Prompt construction ── */

export const SYSTEM_PROMPT = `You are a principal engineer performing project discovery on a repository for an AI development kit generator.

From the file tree and manifest files provided, produce a JSON object with EXACTLY these keys and nothing else (no markdown fence, no commentary):
{
  "projectContextMarkdown": "<a project-context.md with sections: ## Overview, ## Tech stack, ## Architecture, ## Build & run, ## Testing, ## Conventions, ## Open questions>",
  "suggestedTechnologies": ["<lowercase technology ids, e.g. java, spring, dotnet, react, angular, nodejs, python, postgres, docker, kubernetes, aws, azure>"],
  "summary": "<one paragraph summarizing the repository>"
}

Be factual: state only what the files support; put uncertainties under Open questions.`;

export function buildUserPrompt(snapshot: RepoSnapshot): string {
  const parts = [
    `Repository: ${snapshot.owner}/${snapshot.repo}`,
    ``,
    `File tree (truncated):`,
    ...snapshot.paths.map((p) => `- ${p}`),
  ];
  for (const f of snapshot.files) {
    parts.push(``, `<file path="${f.path}">`, f.text, `</file>`);
  }
  return parts.join("\n");
}

/* ── Model output parsing ── */

export type DiscoveryResult = {
  projectContextMarkdown: string;
  suggestedTechnologies: string[];
  summary: string;
};

const FENCE = /^```(?:json)?\n([\s\S]*?)\n```$/;

export function parseDiscovery(raw: string): DiscoveryResult {
  let text = raw.trim();
  const fenced = text.match(FENCE);
  if (fenced) text = fenced[1].trim();

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Model output is not valid JSON");
  }
  const obj = data as Partial<DiscoveryResult>;
  if (
    typeof obj.projectContextMarkdown !== "string" ||
    !obj.projectContextMarkdown ||
    !Array.isArray(obj.suggestedTechnologies) ||
    typeof obj.summary !== "string" ||
    !obj.summary
  ) {
    throw new Error("Model output missing required discovery fields");
  }
  return {
    projectContextMarkdown: obj.projectContextMarkdown,
    suggestedTechnologies: obj.suggestedTechnologies
      .filter((t): t is string => typeof t === "string" && t.length > 0)
      .map((t) => t.toLowerCase())
      .slice(0, 50),
    summary: obj.summary,
  };
}

/* ── Lambda handler ── */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN ?? "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

function respond(status: number, body: unknown): APIGatewayProxyResultV2 {
  return { statusCode: status, headers: CORS_HEADERS, body: JSON.stringify(body) };
}

export function createHandler(llm: LlmClient) {
  return async (
    event: APIGatewayProxyEventV2,
  ): Promise<APIGatewayProxyResultV2> => {
    if (event.requestContext.http.method === "OPTIONS") {
      return respond(204, {});
    }
    if (event.requestContext.http.method !== "POST") {
      return respond(405, { error: "Method not allowed" });
    }

    let parsed;
    try {
      parsed = RepoDiscoveryRequestSchema.safeParse(JSON.parse(event.body ?? ""));
    } catch {
      return respond(400, { error: "Invalid JSON body" });
    }
    if (!parsed.success) {
      return respond(400, { error: "Invalid input", details: parsed.error.issues });
    }

    let snapshot: RepoSnapshot;
    try {
      snapshot = await fetchRepoSnapshot(
        parsed.data.repoUrl,
        parsed.data.ref,
        parsed.data.githubToken,
      );
    } catch (err) {
      console.error("repo fetch failed", err);
      return respond(422, {
        error: err instanceof Error ? err.message : "Repository fetch failed",
      });
    }

    try {
      const raw = await llm.generate(SYSTEM_PROMPT, buildUserPrompt(snapshot));
      const discovery = parseDiscovery(raw);
      return respond(200, { discovery });
    } catch (err) {
      console.error("repo-discovery failed", err);
      return respond(502, { error: "Repository analysis failed" });
    }
  };
}

export const handler = createHandler(new BedrockLlm());
