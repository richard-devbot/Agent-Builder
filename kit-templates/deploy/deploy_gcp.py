#!/usr/bin/env python3
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
    Path(agent, ".env").write_text("".join(f"{k}={v}\n" for k, v in lines.items()))

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
    m = re.search(r"(projects/(\d+)/locations/([\w-]+)/reasoningEngines/(\d{19}))", out)
    if not m:
        sys.exit("❌ Deployment output did not contain a 19-digit reasoningEngines RESOURCE_ID.")
    return {"resourceName": m.group(1), "projectNumber": m.group(2),
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
    print("✅ Deployed:\n" + json.dumps(record, indent=2))
    for f in (".oidc_token", ".gcp_creds.json", f"{a.agent}/.env"):
        Path(f).unlink(missing_ok=True)
    return 0

if __name__ == "__main__":
    sys.exit(main())
