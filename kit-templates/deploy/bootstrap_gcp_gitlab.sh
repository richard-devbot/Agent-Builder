#!/usr/bin/env bash
# One-time setup: keyless GitLab -> GCP deployment for ALL projects in a GitLab group.
set -euo pipefail
: "${PROJECT_ID:?set PROJECT_ID}"
: "${GITLAB_GROUP_PATH:?set GITLAB_GROUP_PATH (e.g. my-group)}"
GITLAB_ISSUER="${GITLAB_ISSUER:-https://gitlab.com}"
POOL_ID="${POOL_ID:-gitlab-pool}"; PROVIDER_ID="${PROVIDER_ID:-gitlab-provider}"
DEPLOYER="${DEPLOYER:-agent-deployer}"; RUNTIME="${RUNTIME:-agent-runtime}"
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
DEPLOYER_SA="${DEPLOYER}@${PROJECT_ID}.iam.gserviceaccount.com"
RUNTIME_SA="${RUNTIME}@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud services enable aiplatform.googleapis.com iam.googleapis.com iamcredentials.googleapis.com \
  sts.googleapis.com cloudtrace.googleapis.com logging.googleapis.com run.googleapis.com \
  cloudbuild.googleapis.com artifactregistry.googleapis.com --project "$PROJECT_ID"

for SA in "$DEPLOYER" "$RUNTIME"; do
  gcloud iam service-accounts describe "${SA}@${PROJECT_ID}.iam.gserviceaccount.com" --project "$PROJECT_ID" >/dev/null 2>&1 \
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

gcloud iam workload-identity-pools describe "$POOL_ID" --location=global --project "$PROJECT_ID" >/dev/null 2>&1 \
  || gcloud iam workload-identity-pools create "$POOL_ID" --location=global --project "$PROJECT_ID" --display-name="GitLab"

gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" --workload-identity-pool="$POOL_ID" \
  --location=global --project "$PROJECT_ID" >/dev/null 2>&1 || \
gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \
  --project "$PROJECT_ID" --location=global --workload-identity-pool="$POOL_ID" \
  --issuer-uri="$GITLAB_ISSUER" \
  --attribute-mapping="google.subject=assertion.sub,attribute.namespace_path=assertion.namespace_path,attribute.project_path=assertion.project_path,attribute.ref=assertion.ref,attribute.ref_protected=assertion.ref_protected" \
  --attribute-condition="assertion.namespace_path.startsWith('${GITLAB_GROUP_PATH}') && assertion.ref_protected == 'true'"

gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER_SA" --project "$PROJECT_ID" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/attribute.namespace_path/${GITLAB_GROUP_PATH}"

cat <<EOF

✅ Done. Add these as GitLab GROUP CI/CD variables (scope per environment):
GCP_PROJECT_ID=${PROJECT_ID}
GCP_PROJECT_NUMBER=${PROJECT_NUMBER}
GCP_LOCATION=<region, e.g. us-central1>
WIF_POOL_ID=${POOL_ID}
WIF_PROVIDER_ID=${PROVIDER_ID}
DEPLOYER_SA=${DEPLOYER_SA}
RUNTIME_SA=${RUNTIME_SA}
EOF
