# author-skill Lambda

AI-authors a `SKILL.md` from an uploaded reference document + the kit builder's
tech selections. Single-file Lambda (`index.ts`) backed by the **AWS Bedrock
Converse API** (default model: Claude Haiku 4.5). The site itself stays fully
static and works without it.

## API

`POST <function-url>` with JSON:

```json
{
  "technologies": ["java", "spring"],
  "projectName": "Helix Billing Service",
  "notes": "All money values in minor units.",
  "document": { "name": "conventions.md", "text": "…plain text, ≤200k chars…" }
}
```

Response: `{ "skill": { "name": "kebab-case-name", "description": "…", "markdown": "---\nname: …" } }`

The request/response contract is the shared zod schema in
`contracts/author-skill.ts` (used by both this handler and the UI client).

## Develop

```bash
cd backend/author-skill
npm install
npm test        # unit tests (fake LLM, no cloud access needed)
npm run typecheck
npm run build   # bundles to dist/index.mjs
```

## Deploy (GitHub Actions)

`.github/workflows/deploy-lambda.yml` tests, builds, zips, and deploys on every
push to `main` that touches `backend/author-skill/` or `contracts/` (also
runnable manually via *workflow_dispatch*). No SAM template.

One-time setup:

1. Create the Lambda function once (Node.js 20, handler `index.handler`, a
   Function URL with CORS `POST` allowed) — e.g.
   `aws lambda create-function --function-name sdlc-playbook-author-skill --runtime nodejs20.x --handler index.handler --zip-file fileb://dist/function.zip --role <execution-role-arn>` then
   `aws lambda create-function-url-config --function-name sdlc-playbook-author-skill --auth-type NONE --cors AllowMethods=POST,AllowOrigins=*`.
   The execution role needs `AWSLambdaBasicExecutionRole` **plus**
   `bedrock:InvokeModel` on the chosen model / inference profile, and the model
   must be enabled in the Bedrock console for the region.
2. Add GitHub **secrets**: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.
3. Optional GitHub **variables**: `AWS_REGION` (default `us-east-1`),
   `BEDROCK_MODEL_ID` (default `us.amazon.nova-pro-v1:0`),
   `BEDROCK_REGION` (defaults to `AWS_REGION`),
   `ALLOWED_ORIGIN` (set to the site URL in prod).

Then build the site with the Function URL:

```bash
NEXT_PUBLIC_AUTHOR_SKILL_API=<function-url> npm run build
```

Without that env var the "AI-author a skill" panel stays hidden and the app
behaves exactly as before (static-only).

## Swapping the LLM

`index.ts` defines the `LlmClient` interface; `BedrockLlm` is the default.
To use another provider, implement the interface and select it at the bottom of
`index.ts`.
