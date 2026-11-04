#!/usr/bin/env python3
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
            match = [l for l in lines if re.match(rf"{lib}(\[.*\])?\s*(==|>=|~=|$)", l)]
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
    if agent_py.is_file() and not re.search(r"^root_agent\s*=", agent_py.read_text(), re.M):
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
    print("❌ Your project is not ready to deploy:\n")
    for e in errors:
        print(f"  • {e}")
    print("\n--- Copy this into Antigravity to fix it ---")
    print(f"Fix the following in this repository without changing agent behaviour, "
          f"following docs/AUTH-STANDARD.md and the company deployment standard:\n"
          + "\n".join(f"- {e}" for e in errors)
          + f"\nThen run: python scripts/check_mandatory_files.py --agent {a.agent}")
    return 1

if __name__ == "__main__":
    sys.exit(main())
