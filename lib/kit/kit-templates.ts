/**
 * Canonical kit templates matching `kit-templates/` byte-for-byte.
 * Used by `lib/kit/build-kit.ts` and `lib/adk/generate.ts` (safe in both
 * browser and server bundles without filesystem access).
 */

import type { KitFile } from "./zip";

export const KIT_VERSION = "2.13.0";

export const CHECK_MANDATORY_FILES_PY = `#!/usr/bin/env python3
"""Mandatory-files gate. Rules come from the company Gemini ADK Agent Deployment Guide.
Exit code 1 on any blocking failure. Prints plain-English fixes + an Antigravity fix prompt."""
import argparse, json, re, sys
from pathlib import Path

REQUIRED_AGENT_FILES = ["__init__.py", "agent.py", "requirements.txt", ".env.example"]
REQUIRED_REPO_FILES = [".gitlab-ci.yml", ".gitignore", "kit.lock.json",
                       "security/semgrep-rules.yaml", "deploy/deploy_gcp.py",
                       "docs/AUTH-STANDARD.md"]
REQUIRED_LIBS = ["google-adk", "google-cloud-aiplatform"]
REQUIRED_ENV_KEYS = {  # None = value injected per environment by CI
    "GOOGLE_GENAI_USE_ENTERPRISE": "True",   # TODO(verify): public ADK docs use GOOGLE_GENAI_USE_VERTEXAI
    "GOOGLE_CLOUD_PROJECT": None,
    "GOOGLE_CLOUD_LOCATION": None,
    "GOOGLE_CLOUD_AGENT_ENGINE_ENABLE_TELEMETRY": "true",
    "OTEL_SEMCONV_STABILITY_OPT_IN": "gen_ai_latest_experimental",
    "OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT": "EVENT_ONLY",
}

def parse_env(path: Path) -> dict:
    out = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip().strip('"').strip("'")
    return out

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--agent", required=True, help="agent folder name, e.g. my_agent")
    ap.add_argument("--root", default=".")
    a = ap.parse_args()
    root, agent = Path(a.root), Path(a.root) / a.agent
    errors: list[str] = []

    if not re.fullmatch(r"[a-z][a-z0-9_]{1,62}", a.agent):
        errors.append(f"Agent folder name '{a.agent}' must be lowercase letters, digits, underscores.")
    for f in REQUIRED_AGENT_FILES:
        if not (agent / f).is_file():
            errors.append(f"Missing required file {a.agent}/{f}.")
    for f in REQUIRED_REPO_FILES:
        if not (root / f).is_file():
            errors.append(f"Missing required kit file {f}.")

    if (agent / ".env").exists():
        errors.append(f"{a.agent}/.env must not be committed. CI creates it at deploy time. Delete it and keep .env.example.")

    req = agent / "requirements.txt"
    if req.is_file():
        lines = [l.strip().lower() for l in req.read_text().splitlines() if l.strip() and not l.startswith("#")]
        for lib in REQUIRED_LIBS:
            match = [l for l in lines if re.match(rf"{lib}(\\[.*\\])?\\s*(==|>=|~=|$)", l)]
            if not match:
                errors.append(f"requirements.txt must include {lib}.")
            elif "==" not in match[0]:
                errors.append(f"Pin an exact version for {lib} (e.g. {lib}==x.y.z).")

    env_ex = agent / ".env.example"
    if env_ex.is_file():
        env = parse_env(env_ex)
        for k, v in REQUIRED_ENV_KEYS.items():
            if k not in env:
                errors.append(f".env.example is missing {k}.")
            elif v is not None and env[k] != v:
                errors.append(f".env.example: {k} must be '{v}' (found '{env[k]}').")

    agent_py = agent / "agent.py"
    if agent_py.is_file() and not re.search(r"^root_agent\\s*=", agent_py.read_text(), re.M):
        errors.append("agent.py must define a top-level variable named root_agent.")

    gi = root / ".gitignore"
    if gi.is_file() and ".env" not in gi.read_text():
        errors.append(".gitignore must ignore .env files.")

    for p in root.rglob("*.json"):
        if ".git" in p.parts:
            continue
        try:
            d = json.loads(p.read_text(encoding="utf-8"))
            if isinstance(d, dict) and d.get("type") == "service_account" and "private_key" in d:
                errors.append(f"Service-account key file found: {p}. Delete it and have the key revoked.")
        except (ValueError, UnicodeDecodeError):
            pass

    if not errors:
        print("✅ All mandatory files and settings are present.")
        return 0
    print("❌ Your project is not ready to deploy:\\n")
    for e in errors:
        print(f"  • {e}")
    print("\\n--- Copy this into Antigravity to fix it ---")
    print(f"Fix the following in this repository without changing agent behaviour, "
          f"following docs/AUTH-STANDARD.md and the company deployment standard:\\n"
          + "\\n".join(f"- {e}" for e in errors)
          + f"\\nThen run: python scripts/check_mandatory_files.py --agent {a.agent}")
    return 1

if __name__ == "__main__":
    sys.exit(main())
`;

export const SEMGREP_RULES_YAML = `rules:
  - id: tls-verification-disabled
    languages: [python]
    severity: ERROR
    message: "TLS verification disabled. Remove verify=False; use REQUESTS_CA_BUNDLE for the corporate CA."
    pattern-either:
      - pattern: $F(..., verify=False, ...)
      - pattern: urllib3.disable_warnings(...)
  - id: subprocess-shell-true
    languages: [python]
    severity: ERROR
    message: "shell=True enables command injection. Pass an argument list instead."
    pattern: subprocess.$F(..., shell=True, ...)
  - id: hardcoded-reasoning-engine
    languages: [python, generic]
    severity: ERROR
    message: "Hard-coded Agent Engine resource. Read project/location/engine ID from environment variables."
    pattern-regex: 'reasoningEngines/\\d{6,}'
  - id: hardcoded-google-api-key
    languages: [generic]
    severity: ERROR
    message: "Google API key in source. Use Vertex AI with ADC; store secrets in Secret Manager."
    pattern-regex: '${"AI" + "za"}[0-9A-Za-z_\\-]{35}'
  - id: public-cloud-run
    languages: [generic]
    severity: ERROR
    message: "Public access is not allowed. Remove allUsers/allAuthenticatedUsers and --allow-unauthenticated."
    pattern-regex: '(allUsers|allAuthenticatedUsers|--allow-unauthenticated)'
  - id: gcloud-token-subprocess
    languages: [python]
    severity: ERROR
    message: "Do not shell out to gcloud for tokens. Use google.auth.default()."
    pattern-regex: 'print-access-token'
`;

export const GITLAB_CI_YML_TEMPLATE = `# Agent Builder kit - governed GitLab pipeline.
# GCP values come from GROUP-level CI/CD variables set once by the platform admin.
# No keys are stored anywhere; GitLab authenticates to GCP with OIDC (Workload Identity Federation).

workflow:
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
    - if: $CI_COMMIT_TAG
    - if: $CI_PIPELINE_SOURCE == "api" || $CI_PIPELINE_SOURCE == "web"

variables:
  AGENT_FOLDER: "{{AGENT_FOLDER}}"          # templated by Agent Builder
  DEPLOY_TARGET:
    value: "none"
    options: ["none", "agent_engine", "cloud_run", "gemini_enterprise"]
    description: "Set by Agent Builder 'Deploy to Cloud'."
  DEPLOY_ENV:
    value: "dev"
    options: ["dev", "uat", "prod"]
  PIP_DISABLE_PIP_VERSION_CHECK: "1"

stages: [validate, security, test, deploy]

default:
  image: python:3.11-slim
  interruptible: true

mandatory_files:
  stage: validate
  script:
    - python scripts/check_mandatory_files.py --agent "$AGENT_FOLDER"

secret_scan:
  stage: security
  image: { name: zricethezav/gitleaks:v8.18.4, entrypoint: [""] }   # TODO(verify): pin to your approved version
  script:
    - gitleaks detect --source . --no-banner --redact --exit-code 1

sast:
  stage: security
  script:
    - pip install --quiet "semgrep==1.85.0"     # TODO(verify): pin approved version
    - semgrep scan --config security/semgrep-rules.yaml --error --metrics=off .

dependency_audit:
  stage: security
  allow_failure: true            # warning-only for the POC
  script:
    - pip install --quiet pip-audit
    - pip-audit -r "$AGENT_FOLDER/requirements.txt"

smoke_test:
  stage: test
  script:
    - pip install --quiet -r "$AGENT_FOLDER/requirements.txt"
    - python -c "import importlib,os; m=importlib.import_module(os.environ['AGENT_FOLDER']+'.agent'); assert m.root_agent, 'root_agent missing'; print('root_agent loaded:', m.root_agent.name)"

.deploy_base:
  stage: deploy
  resource_group: deploy-$DEPLOY_ENV     # one deployment per environment at a time
  environment:
    name: $DEPLOY_ENV
  id_tokens:
    GITLAB_OIDC_TOKEN:
      aud: https://iam.googleapis.com/projects/\${GCP_PROJECT_NUMBER}/locations/global/workloadIdentityPools/\${WIF_POOL_ID}/providers/\${WIF_PROVIDER_ID}
  rules:
    - if: $CI_COMMIT_TAG && $DEPLOY_TARGET != "none"   # deploy ONLY protected release tags
  artifacts:
    paths: [deployment-record.json]
    expire_in: 1 year

deploy_gcp:
  extends: .deploy_base
  image: gcr.io/google.com/cloudsdktool/google-cloud-cli:slim   # gcloud needed for cloud_run
  script:
    - apt-get update -qq && apt-get install -y -qq python3-venv >/dev/null
    - python3 -m venv /tmp/venv && . /tmp/venv/bin/activate
    - pip install --quiet -r "$AGENT_FOLDER/requirements.txt"
    - python deploy/deploy_gcp.py --target "$DEPLOY_TARGET" --agent "$AGENT_FOLDER"
`;

export const DEPLOY_GCP_PY = `#!/usr/bin/env python3
"""Automated GCP deployment run inside GitLab CI. No keys: uses GitLab OIDC -> WIF -> deployer SA.
Targets: agent_engine (per company guide), cloud_run, gemini_enterprise (agent_engine + register)."""
import argparse, json, os, re, subprocess, sys
from datetime import datetime, timezone
from pathlib import Path

def env(name: str, required: bool = True) -> str:
    v = os.environ.get(name, "")
    if required and not v:
        sys.exit(f"❌ Missing CI variable {name}. Ask the platform admin to set it at GitLab group level.")
    return v

def setup_credentials() -> None:
    """Write an external_account credential config so google-auth / adk / gcloud use WIF."""
    Path(".oidc_token").write_text(env("GITLAB_OIDC_TOKEN"))
    num, pool, prov, sa = env("GCP_PROJECT_NUMBER"), env("WIF_POOL_ID"), env("WIF_PROVIDER_ID"), env("DEPLOYER_SA")
    cfg = {
        "type": "external_account",
        "audience": f"//iam.googleapis.com/projects/{num}/locations/global/workloadIdentityPools/{pool}/providers/{prov}",
        "subject_token_type": "urn:ietf:params:oauth:token-type:jwt",
        "token_url": "https://sts.googleapis.com/v1/token",
        "service_account_impersonation_url":
            f"https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/{sa}:generateAccessToken",
        "credential_source": {"file": str(Path(".oidc_token").resolve())},
    }
    Path(".gcp_creds.json").write_text(json.dumps(cfg))
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(Path(".gcp_creds.json").resolve())
    subprocess.run(["gcloud", "auth", "login", "--cred-file=.gcp_creds.json", "--quiet"], check=True)

def render_env_file(agent: str) -> None:
    """Company guide section 3: .env inside the agent folder, created at deploy time (never committed)."""
    lines = {
        "GOOGLE_GENAI_USE_ENTERPRISE": "True",  # TODO(verify) vs GOOGLE_GENAI_USE_VERTEXAI
        "GOOGLE_CLOUD_PROJECT": env("GCP_PROJECT_ID"),
        "GOOGLE_CLOUD_LOCATION": env("GCP_LOCATION"),
        "GOOGLE_CLOUD_AGENT_ENGINE_ENABLE_TELEMETRY": "true",
        "OTEL_SEMCONV_STABILITY_OPT_IN": "gen_ai_latest_experimental",
        "OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT": "EVENT_ONLY",
    }
    Path(agent, ".env").write_text("".join(f"{k}={v}\\n" for k, v in lines.items()))

def run(cmd: list[str]) -> str:
    print("▶", " ".join(cmd))
    p = subprocess.run(cmd, capture_output=True, text=True)   # list args, never shell=True
    print(p.stdout); print(p.stderr, file=sys.stderr)
    if p.returncode != 0:
        sys.exit(f"❌ Command failed with exit code {p.returncode}.")
    return p.stdout + p.stderr

def display_name(agent: str) -> str:
    return os.environ.get("AGENT_DISPLAY_NAME") or f"{agent}-{os.environ.get('DEPLOY_ENV', 'dev')}"

def deploy_agent_engine(agent: str) -> dict:
    out = run(["adk", "deploy", "agent_engine",
               f"--project={env('GCP_PROJECT_ID')}", f"--region={env('GCP_LOCATION')}",
               f"--display_name={display_name(agent)}", agent])
    # TODO(verify): flag for custom runtime service account (RUNTIME_SA) in the pinned ADK version.
    m = re.search(r"(projects/(\\d+)/locations/([\\w-]+)/reasoningEngines/(\\d{19}))", out)
    if not m:
        sys.exit("❌ Deployment output did not contain a 19-digit reasoningEngines RESOURCE_ID.")
    return {"resourceName": m.group(1), \"projectNumber\": m.group(2),
            "location": m.group(3), "resourceId": m.group(4)}

def deploy_cloud_run(agent: str) -> dict:
    service = re.sub(r"[^a-z0-9-]", "-", display_name(agent).lower())[:49]
    run(["gcloud", "run", "deploy", service, "--source", ".",
         f"--project={env('GCP_PROJECT_ID')}", f"--region={env('GCP_LOCATION')}",
         f"--service-account={env('RUNTIME_SA')}",
         "--no-allow-unauthenticated", "--ingress=internal-and-cloud-load-balancing", "--quiet"])
    url = run(["gcloud", "run", "services", "describe", service, f"--project={env('GCP_PROJECT_ID')}",
               f"--region={env('GCP_LOCATION')}", "--format=value(status.url)"]).strip().splitlines()[0]
    return {"service": service, "url": url}

def register_gemini_enterprise(record: dict) -> dict:
    """TODO(verify): Gemini Enterprise (Discovery Engine) agent registration API and version."""
    import google.auth
    from google.auth.transport.requests import AuthorizedSession
    creds, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
    s = AuthorizedSession(creds)
    project, app_id = env("GCP_PROJECT_ID"), env("GE_APP_ID")
    ge_loc = os.environ.get("GE_LOCATION", "global")
    url = (f"https://discoveryengine.googleapis.com/v1alpha/projects/{project}/locations/{ge_loc}"
           f"/collections/default_collection/engines/{app_id}/assistants/default_assistant/agents")
    body = {"displayName": os.environ.get("AGENT_DISPLAY_NAME", record["displayName"]),
            "description": os.environ.get("AGENT_DESCRIPTION", "Internal agent deployed by Agent Builder"),
            "adkAgentDefinition": {
                "toolSettings": {"toolDescription": os.environ.get("AGENT_DESCRIPTION", "Internal agent")},
                "provisionedReasoningEngine": {"reasoningEngine": record["resourceName"]}}}
    r = s.post(url, json=body, timeout=60); r.raise_for_status()
    return {"geminiEnterpriseAgent": r.json().get("name")}

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", required=True, choices=["agent_engine", "cloud_run", "gemini_enterprise"])
    ap.add_argument("--agent", required=True)
    a = ap.parse_args()
    setup_credentials()
    record = {"target": a.target, "environment": os.environ.get("DEPLOY_ENV"),
              "displayName": display_name(a.agent), "gcpProject": env("GCP_PROJECT_ID"),
              "commitSha": os.environ.get("CI_COMMIT_SHA"), "tag": os.environ.get("CI_COMMIT_TAG"),
              "pipelineUrl": os.environ.get("CI_PIPELINE_URL"),
              "deployedBy": os.environ.get("GITLAB_USER_LOGIN"),
              "deployedAt": datetime.now(timezone.utc).isoformat()}
    try:
        kit = json.loads(Path("kit.lock.json").read_text()); record["kitVersion"] = kit.get("kitVersion")
    except (OSError, ValueError):
        record["kitVersion"] = None
    if a.target in ("agent_engine", "gemini_enterprise"):
        render_env_file(a.agent)
        record.update(deploy_agent_engine(a.agent))
        if a.target == "gemini_enterprise":
            record.update(register_gemini_enterprise(record))
    else:
        record.update(deploy_cloud_run(a.agent))
    Path("deployment-record.json").write_text(json.dumps(record, indent=2))
    print("✅ Deployed:\\n" + json.dumps(record, indent=2))
    for f in (".oidc_token", ".gcp_creds.json", f"{a.agent}/.env"):
        Path(f).unlink(missing_ok=True)
    return 0

if __name__ == "__main__":
    sys.exit(main())
`;

export const BOOTSTRAP_GCP_GITLAB_SH = `#!/usr/bin/env bash
# One-time setup: keyless GitLab -> GCP deployment for ALL projects in a GitLab group.
set -euo pipefail
: "\${PROJECT_ID:?set PROJECT_ID}"
: "\${GITLAB_GROUP_PATH:?set GITLAB_GROUP_PATH (e.g. my-group)}"
GITLAB_ISSUER="\${GITLAB_ISSUER:-https://gitlab.com}"
POOL_ID="\${POOL_ID:-gitlab-pool}"; PROVIDER_ID="\${PROVIDER_ID:-gitlab-provider}"
DEPLOYER="\${DEPLOYER:-agent-deployer}"; RUNTIME="\${RUNTIME:-agent-runtime}"
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
DEPLOYER_SA="\${DEPLOYER}@\${PROJECT_ID}.iam.gserviceaccount.com"
RUNTIME_SA="\${RUNTIME}@\${PROJECT_ID}.iam.gserviceaccount.com"

gcloud services enable aiplatform.googleapis.com iam.googleapis.com iamcredentials.googleapis.com \\
  sts.googleapis.com cloudtrace.googleapis.com logging.googleapis.com run.googleapis.com \\
  cloudbuild.googleapis.com artifactregistry.googleapis.com --project "$PROJECT_ID"

for SA in "$DEPLOYER" "$RUNTIME"; do
  gcloud iam service-accounts describe "\${SA}@\${PROJECT_ID}.iam.gserviceaccount.com" --project "$PROJECT_ID" >/dev/null 2>&1 \\
    || gcloud iam service-accounts create "$SA" --project "$PROJECT_ID"
done

bind() { gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$1" --role="$2" --condition=None --quiet >/dev/null; }
# Company guide 4.1 - deployer
bind "$DEPLOYER_SA" roles/aiplatform.admin
bind "$DEPLOYER_SA" roles/iam.serviceAccountUser
# Company guide 4.1 - runtime
bind "$RUNTIME_SA" roles/aiplatform.user
bind "$RUNTIME_SA" roles/cloudtrace.agent
bind "$RUNTIME_SA" roles/logging.logWriter
# Beyond the guide (only if Cloud Run / Gemini Enterprise targets are used) - TODO(verify) minimal set
bind "$DEPLOYER_SA" roles/run.admin
bind "$DEPLOYER_SA" roles/cloudbuild.builds.editor
bind "$DEPLOYER_SA" roles/artifactregistry.writer
bind "$DEPLOYER_SA" roles/storage.admin
bind "$DEPLOYER_SA" roles/discoveryengine.editor

gcloud iam workload-identity-pools describe "$POOL_ID" --location=global --project "$PROJECT_ID" >/dev/null 2>&1 \\
  || gcloud iam workload-identity-pools create "$POOL_ID" --location=global --project "$PROJECT_ID" --display-name="GitLab"

gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" --workload-identity-pool="$POOL_ID" \\
  --location=global --project "$PROJECT_ID" >/dev/null 2>&1 || \\
gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \\
  --project "$PROJECT_ID" --location=global --workload-identity-pool="$POOL_ID" \\
  --issuer-uri="$GITLAB_ISSUER" \\
  --attribute-mapping="google.subject=assertion.sub,attribute.namespace_path=assertion.namespace_path,attribute.project_path=assertion.project_path,attribute.ref=assertion.ref,attribute.ref_protected=assertion.ref_protected" \\
  --attribute-condition="assertion.namespace_path.startsWith('\${GITLAB_GROUP_PATH}') && assertion.ref_protected == 'true'"

gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER_SA" --project "$PROJECT_ID" \\
  --role=roles/iam.workloadIdentityUser \\
  --member="principalSet://iam.googleapis.com/projects/\${PROJECT_NUMBER}/locations/global/workloadIdentityPools/\${POOL_ID}/attribute.namespace_path/\${GITLAB_GROUP_PATH}"

cat <<EOF

✅ Done. Add these as GitLab GROUP CI/CD variables (scope per environment):
GCP_PROJECT_ID=\${PROJECT_ID}
GCP_PROJECT_NUMBER=\${PROJECT_NUMBER}
GCP_LOCATION=<region, e.g. us-central1>
WIF_POOL_ID=\${POOL_ID}
WIF_PROVIDER_ID=\${PROVIDER_ID}
DEPLOYER_SA=\${DEPLOYER_SA}
RUNTIME_SA=\${RUNTIME_SA}
EOF
`;

export const AUTH_STANDARD_MD = `# Authentication Standard (mandatory)

## Golden rules
1. Never write your own login, password storage, or session system.
2. Nothing is public. No \`allUsers\`, no \`--allow-unauthenticated\`, no open endpoints.
3. No secrets in code, .env, or chat. Secrets live in Google Secret Manager and are read at
   runtime by the runtime service account.
4. Users authenticate with company SSO (Microsoft Entra ID). Services authenticate with
   Google IAM (service accounts / Workload Identity). Never use API keys or JSON keys.

## By deployment target
| Target | How users get in | What the code must do |
|---|---|---|
| Agent Engine (Vertex AI) | Through Gemini Enterprise (users sign in with Entra via workforce identity) or internal callers using their own IAM identity | Nothing extra. No public endpoint exists. Do not add web servers. |
| Gemini Enterprise | Same as above; access controlled by Gemini Enterprise app permissions | Same as above |
| Cloud Run (API or web app) | Entra ID login. Every request carries an Entra access token | Protect ALL routes with \`security/entra_auth.py\` (\`require_user\`), except \`/healthz\`. Restrict by app role \`ENTRA_ALLOWED_ROLES\`. Ingress \`internal-and-cloud-load-balancing\`. |

## Agent safety (all targets)
- Keep the \`before_model_callback\` (prompt-injection and secret shields) and
  \`before_tool_callback\` (destructive-action blockers) generated by the kit.
- Tools that write or send data must ask for human confirmation.
- Never log full user messages or personal data (telemetry is EVENT_ONLY).
- Act on behalf of the user's permissions where the source system supports it.

## Do / Don't
- DON'T: \`requests.get(url, verify=False)\` → DO: set \`REQUESTS_CA_BUNDLE\`.
- DON'T: \`subprocess.run("gcloud auth print-access-token", shell=True)\`
  → DO: \`google.auth.default()\` + \`AuthorizedSession\`.
- DON'T: \`ENGINE_ID = "8846..."\` → DO: \`os.environ["AGENT_ENGINE_ID"]\`.
- DON'T: \`@app.get("/data")\` with no auth → DO: \`router = APIRouter(dependencies=[Depends(require_user)])\`.
`;

export const ENTRA_AUTH_PY = `"""Microsoft Entra ID bearer token validator for Cloud Run APIs and web apps.
Enforces docs/AUTH-STANDARD.md: every route except /healthz must depend on require_user."""
from __future__ import annotations

import os
from typing import Any

# TODO(verify): confirm exact PyJWT + cryptography JWKS verification settings for your Entra tenant.
import jwt
from jwt import PyJWKClient
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

_bearer = HTTPBearer(auto_error=True)
_jwk_client: PyJWKClient | None = None


def _get_jwk_client() -> PyJWKClient:
    global _jwk_client
    if _jwk_client is None:
        tenant_id = os.environ.get("ENTRA_TENANT_ID", "")
        if not tenant_id:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="ENTRA_TENANT_ID environment variable is not set.",
            )
        jwks_url = f"https://login.microsoftonline.com/{tenant_id}/discovery/v2.0/keys"
        _jwk_client = PyJWKClient(jwks_url)
    return _jwk_client


def require_user(
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
) -> dict[str, Any]:
    """Validate an Entra ID v2.0 JWT access token and enforce ENTRA_ALLOWED_ROLES."""
    tenant_id = os.environ.get("ENTRA_TENANT_ID", "")
    audience = os.environ.get("ENTRA_CLIENT_ID", "")
    if not tenant_id or not audience:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="ENTRA_TENANT_ID and ENTRA_CLIENT_ID must be configured.",
        )
    token = creds.credentials
    try:
        signing_key = _get_jwk_client().get_signing_key_from_jwt(token)
        claims: dict[str, Any] = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=audience,
            issuer=f"https://login.microsoftonline.com/{tenant_id}/v2.0",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired Microsoft Entra ID token.",
        ) from exc

    allowed_raw = os.environ.get("ENTRA_ALLOWED_ROLES", "")
    allowed_roles = {r.strip() for r in allowed_raw.split(",") if r.strip()}
    if allowed_roles:
        token_roles = set(claims.get("roles") or [])
        if not token_roles.intersection(allowed_roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your Entra ID role is not authorised for this agent endpoint.",
            )

    return {
        "oid": claims.get("oid") or claims.get("sub"),
        "name": claims.get("name"),
        "email": claims.get("preferred_username") or claims.get("email"),
        "roles": claims.get("roles") or [],
    }
`;

export function renderGitLabCiYml(agentFolder: string): string {
  return GITLAB_CI_YML_TEMPLATE.replace("{{AGENT_FOLDER}}", agentFolder);
}

export function renderAgentEnvExample(
  extraVars: Array<{ name: string; example: string; description?: string }> = [],
): string {
  const lines = [
    "# Copy to .env only for local testing; NEVER commit .env to Git.",
    "# In GitLab CI, deploy/deploy_gcp.py renders .env at deploy time from group variables.",
    "GOOGLE_GENAI_USE_ENTERPRISE=True",
    "GOOGLE_CLOUD_PROJECT=",
    "GOOGLE_CLOUD_LOCATION=",
    "GOOGLE_CLOUD_AGENT_ENGINE_ENABLE_TELEMETRY=true",
    "OTEL_SEMCONV_STABILITY_OPT_IN=gen_ai_latest_experimental",
    "OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT=EVENT_ONLY",
  ];
  if (extraVars.length > 0) {
    lines.push("", "# Agent tool configuration (non-secret identifiers)");
    for (const v of extraVars) {
      if (v.description) lines.push(`# ${v.description}`);
      lines.push(`${v.name}=${v.example}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

export function renderRepoGitignore(): string {
  return [
    "# Secrets & environment files (never commit)",
    ".env",
    "**/.env",
    ".oidc_token",
    ".gcp_creds.json",
    "*.pem",
    "*.key",
    "",
    "# Python",
    "__pycache__/",
    "*.py[cod]",
    ".venv/",
    "venv/",
    ".pytest_cache/",
    "",
  ].join("\n");
}

export function renderCloudRunDockerfile(agentFolder: string): string {
  return [
    "FROM python:3.11-slim",
    "WORKDIR /app",
    "ENV PYTHONUNBUFFERED=1",
    "ENV PORT=8080",
    "",
    `COPY ${agentFolder}/requirements.txt ./requirements.txt`,
    "RUN pip install --no-cache-dir -r requirements.txt",
    "",
    "COPY . .",
    "",
    "EXPOSE 8080",
    `CMD ["uvicorn", "${agentFolder}.fast_api_app:app", "--host", "0.0.0.0", "--port", "8080"]`,
    "",
  ].join("\n");
}

export function buildGovernedRepoTemplateFiles(options: {
  agentFolder: string;
  deployTarget?: "agent_engine" | "cloud_run" | "gemini_enterprise";
  provider?: string;
}): KitFile[] {
  const { agentFolder, deployTarget = "agent_engine", provider = "google-adk" } = options;
  const files: KitFile[] = [
    {
      path: ".gitlab-ci.yml",
      contents: renderGitLabCiYml(agentFolder),
    },
    {
      path: ".gitignore",
      contents: renderRepoGitignore(),
    },
    {
      path: ".env.example",
      contents: renderAgentEnvExample(),
    },
    {
      path: "kit.lock.json",
      contents:
        JSON.stringify(
          {
            kitVersion: KIT_VERSION,
            agentFolder,
            deployTarget,
            provider,
          },
          null,
          2,
        ) + "\n",
    },
    {
      path: "scripts/check_mandatory_files.py",
      contents: CHECK_MANDATORY_FILES_PY,
    },
    {
      path: "deploy/deploy_gcp.py",
      contents: DEPLOY_GCP_PY,
    },
    {
      path: "deploy/bootstrap_gcp_gitlab.sh",
      contents: BOOTSTRAP_GCP_GITLAB_SH,
    },
    {
      path: "security/semgrep-rules.yaml",
      contents: SEMGREP_RULES_YAML,
    },
    {
      path: "security/entra_auth.py",
      contents: ENTRA_AUTH_PY,
    },
    {
      path: "docs/AUTH-STANDARD.md",
      contents: AUTH_STANDARD_MD,
    },
  ];

  if (deployTarget === "cloud_run") {
    files.push({
      path: "Dockerfile",
      contents: renderCloudRunDockerfile(agentFolder),
    });
  }

  return files;
}
