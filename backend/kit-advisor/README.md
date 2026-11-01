# kit-advisor Lambda

Reviews the wizard's selections, answers, and the generated instruction-file
draft (e.g. CLAUDE.md), returning refinement suggestions and unanswered
questions that matter for the chosen stack. Single-file Lambda (`index.ts`)
backed by the **AWS Bedrock Converse API** (default model: Claude 3.5 Sonnet).
The site stays fully static and works without it.

## API

`POST <function-url>` with JSON:

```json
{
  "technologies": ["java", "spring"],
  "projectType": "legacy-migration",
  "answers": { "legacy-source": "COBOL / mainframe" },
  "draftMarkdown": "# CLAUDE.md…"
}
```

Response:

```json
{
  "advice": {
    "suggestions": [
      { "title": "…", "detail": "…", "severity": "info | recommended | important" }
    ],
    "missingAnswers": ["…"]
  }
}
```

The contract is the shared zod schema in `contracts/kit-advisor.ts`.

## Develop

```bash
cd backend/kit-advisor
npm install
npm test                    # unit tests (fake LLM, no cloud access)
npm run typecheck
npm run build               # bundles to dist/index.mjs
node bedrock-e2e-test.mjs   # built bundle against a local Bedrock stub
```

## Deploy

Same pattern as author-skill — see `backend/author-skill/README.md` and
`.github/workflows/deploy-lambda.yml`. Function name:
`sdlc-playbook-kit-advisor`. The execution role needs `bedrock:InvokeModel`.
The site calls it when built with
`NEXT_PUBLIC_KIT_ADVISOR_API=<function-url>`.
