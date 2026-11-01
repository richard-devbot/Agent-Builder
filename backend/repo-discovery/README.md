# repo-discovery Lambda

Analyzes a **public GitHub repository** server-side and returns a
`project-context.md` draft, suggested technology ids to pre-fill the wizard,
and a summary. Single-file Lambda (`index.ts`): reads the repo via the GitHub
REST API (file tree + manifest files — no git binary), then synthesizes the
context document with the **AWS Bedrock Converse API** (default model: Claude
3.5 Sonnet). The site stays fully static and works without it.

## API

`POST <function-url>` with JSON:

```json
{ "repoUrl": "https://github.com/org/repo", "ref": "main" }
```

Response:

```json
{
  "discovery": {
    "projectContextMarkdown": "## Overview…",
    "suggestedTechnologies": ["java", "spring"],
    "summary": "…"
  }
}
```

Errors: `400` invalid input · `422` repo unreachable / non-GitHub URL ·
`502` model failure.

The contract is the shared zod schema in `contracts/repo-discovery.ts`.

## Develop

```bash
cd backend/repo-discovery
npm install
npm test                    # unit tests (fake LLM + GitHub stub, no cloud access)
npm run typecheck
npm run build               # bundles to dist/index.mjs
node bedrock-e2e-test.mjs   # built bundle against local Bedrock + GitHub stubs
```

## Deploy

Same pattern as author-skill — see `backend/author-skill/README.md` and
`.github/workflows/deploy-lambda.yml`. Function name:
`sdlc-playbook-repo-discovery`. The execution role needs
`bedrock:InvokeModel`; optionally set `GITHUB_TOKEN` for rate limits /
private repos. The site calls it when built with
`NEXT_PUBLIC_REPO_DISCOVERY_API=<function-url>`.
