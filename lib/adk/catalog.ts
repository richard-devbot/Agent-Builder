/**
 * Enterprise Tool, Connector, MCP & Skill presets for the Google ADK Studio,
 * plus deterministic Brief → ADK Flow synthesis so the visual canvas updates
 * live during Discovery (just like CrewAI Studio v2) even in Guided mode.
 */

import type {
  AdkAgent,
  AdkAuthType,
  AdkBuiltinTool,
  AdkEnvVar,
  AdkEvalCase,
  AdkProject,
  AdkTool,
  AdkToolKind,
  AdkTrigger,
} from "@/contracts/adk";
import type { Brief } from "@/contracts/intake";
import { DEFAULT_ADK_MODEL, normalizeAdkProject, pyName } from "./normalize";

export interface EnterpriseToolPreset {
  id: string;
  name: string;
  title: string;
  kind: AdkToolKind;
  builtin?: AdkBuiltinTool;
  connectorSystem?: string;
  mcpServer?: string;
  ragDataStoreId?: string;
  authType: AdkAuthType;
  requireConfirmation?: boolean;
  description: string;
  code?: string;
  imports: string[];
  dependencies: string[];
  envVars: AdkEnvVar[];
}

export const ENTERPRISE_TOOL_PRESETS: EnterpriseToolPreset[] = [
  {
    id: "vertex_rag_search",
    name: "search_enterprise_knowledge",
    title: "Vertex AI Search (RAG Grounding)",
    kind: "vertex_rag",
    ragDataStoreId: "VERTEX_SEARCH_DATA_STORE_ID",
    authType: "adc_wif",
    description: "Grounds answers in internal documents indexed in Google Cloud Vertex AI Search (Discovery Engine).",
    code: `def search_enterprise_knowledge(query: str) -> dict:
    """Searches internal enterprise documents in Vertex AI Search (Discovery Engine).

    Args:
        query: The natural-language search query.

    Returns:
        dict with 'status', 'data_store', and 'results'.
    """
    data_store_id = os.environ.get("VERTEX_SEARCH_DATA_STORE_ID", "")
    if not data_store_id:
        return {"status": "not_configured", "missing_env": "VERTEX_SEARCH_DATA_STORE_ID", "query": query}
    return {"status": "ready", "data_store": data_store_id, "query": query}`,
    imports: ["import os"],
    dependencies: [],
    envVars: [
      {
        name: "VERTEX_SEARCH_DATA_STORE_ID",
        example: "default_collection/dataStores/enterprise-docs",
        description: "Vertex AI Search Data Store resource identifier",
        isSecret: false,
        boundTo: "Vertex AI Search",
        authMode: "adc_wif",
      },
    ],
  },
  {
    id: "sap_odata_connector",
    name: "sap_erp_lookup_and_stage",
    title: "SAP ERP (OData PO & Invoice Connector)",
    kind: "connector",
    connectorSystem: "SAP",
    authType: "secret_manager",
    requireConfirmation: true,
    description: "Looks up purchase orders and stages validated supplier invoices in SAP S/4HANA via OData.",
    code: `def sap_erp_lookup_and_stage(po_number: str, invoice_total: float, action: str) -> dict:
    """Validates a purchase order or stages an invoice in SAP ERP.

    Args:
        po_number: SAP Purchase Order reference number.
        invoice_total: Total invoice amount in document currency.
        action: Either 'lookup_po' (read-only) or 'stage_invoice' (requires confirmation).

    Returns:
        dict with 'status', 'system', and PO match details.
    """
    base_url = os.environ.get("SAP_SYSTEM_ID_AND_COMPANY_CODE", "")
    secret_configured = bool(os.environ.get("SAP_OAUTH_CLIENT_SECRET", ""))
    if not base_url or not secret_configured:
        return {
            "status": "not_configured",
            "system": "SAP",
            "po_number": po_number,
            "invoice_total": invoice_total,
            "action": action,
        }
    return {
        "status": "staged" if action == "stage_invoice" else "matched",
        "system": "SAP",
        "po_number": po_number,
        "invoice_total": invoice_total,
    }`,
    imports: ["import os"],
    dependencies: ["requests>=2.31.0"],
    envVars: [
      {
        name: "SAP_SYSTEM_ID_AND_COMPANY_CODE",
        example: "S4P_1000",
        description: "SAP system identifier and company code",
        isSecret: false,
        boundTo: "SAP",
        authMode: "adc_wif",
      },
      {
        name: "SAP_OAUTH_CLIENT_SECRET",
        example: "stored-in-gcp-secret-manager",
        description: "SAP OData OAuth client secret injected from GCP Secret Manager",
        isSecret: true,
        secretRef: "SAP_OAUTH_CLIENT_SECRET:latest",
        boundTo: "SAP",
        authMode: "secret_manager",
      },
    ],
  },
  {
    id: "servicenow_itsm_connector",
    name: "servicenow_ticket_action",
    title: "ServiceNow ITSM (Incident & Queue Connector)",
    kind: "connector",
    connectorSystem: "ServiceNow",
    authType: "secret_manager",
    requireConfirmation: false,
    description: "Reads, classifies, and updates support incidents in ServiceNow queues.",
    code: `def servicenow_ticket_action(incident_id: str, queue_Action: str, summary_note: str) -> dict:
    """Fetches or updates an incident record in ServiceNow.

    Args:
        incident_id: The ServiceNow incident number (e.g. INC001024).
        queue_Action: Operation to perform ('fetch', 'add_work_note', or 'route_queue').
        summary_note: Triage summary or routing note to attach.

    Returns:
        dict with 'status', 'incident_id', and 'queue'.
    """
    instance = os.environ.get("SERVICENOW_INSTANCE_AND_QUEUE", "")
    has_secret = bool(os.environ.get("SERVICENOW_OAUTH_CLIENT_SECRET", ""))
    if not instance or not has_secret:
        return {"status": "not_configured", "system": "ServiceNow", "incident_id": incident_id}
    return {"status": "ok", "system": "ServiceNow", "incident_id": incident_id, "action": queue_Action, "note": summary_note}`,
    imports: ["import os"],
    dependencies: ["requests>=2.31.0"],
    envVars: [
      {
        name: "SERVICENOW_INSTANCE_AND_QUEUE",
        example: " my-instance.service-now.com / IT-Helpdesk".trim(),
        description: "ServiceNow instance hostname and default assignment queue",
        isSecret: false,
        boundTo: "ServiceNow",
        authMode: "adc_wif",
      },
      {
        name: "SERVICENOW_OAUTH_CLIENT_SECRET",
        example: "stored-in-gcp-secret-manager",
        description: "ServiceNow OAuth integration secret in GCP Secret Manager",
        isSecret: true,
        secretRef: "SERVICENOW_OAUTH_CLIENT_SECRET:latest",
        boundTo: "ServiceNow",
        authMode: "secret_manager",
      },
    ],
  },
  {
    id: "salesforce_crm_connector",
    name: "salesforce_account_context",
    title: "Salesforce CRM (Account & Case Lookup)",
    kind: "connector",
    connectorSystem: "Salesforce",
    authType: "oauth_user_consent",
    requireConfirmation: false,
    description: "Retrieves customer account, opportunity, and case history from Salesforce using OAuth 2.0.",
    code: `def salesforce_account_context(account_name: str, include_open_cases: bool) -> dict:
    """Retrieves Salesforce customer account and open case details.

    Args:
        account_name: Customer account name or external CRM identifier.
        include_open_cases: Whether to include open support cases.

    Returns:
        dict with 'status', 'account', and 'open_cases'.
    """
    instance_url = os.environ.get("SALESFORCE_INSTANCE_URL", "")
    if not instance_url:
        return {"status": "not_configured", "system": "Salesforce", "account": account_name}
    return {"status": "ok", "system": "Salesforce", "account": account_name, "include_open_cases": include_open_cases}`,
    imports: ["import os"],
    dependencies: ["requests>=2.31.0"],
    envVars: [
      {
        name: "SALESFORCE_INSTANCE_URL",
        example: "https://company.my.salesforce.com",
        description: "Salesforce My Domain instance URL",
        isSecret: false,
        boundTo: "Salesforce",
        authMode: "oauth_user_consent",
      },
      {
        name: "SALESFORCE_CONNECTED_APP_KEY",
        example: "stored-in-gcp-secret-manager",
        description: "Salesforce Connected App credential in GCP Secret Manager",
        isSecret: true,
        secretRef: "SALESFORCE_CONNECTED_APP_KEY:latest",
        boundTo: "Salesforce",
        authMode: "secret_manager",
      },
    ],
  },
  {
    id: "sharepoint_graph_connector",
    name: "sharepoint_document_reader",
    title: "SharePoint / Microsoft 365 (Graph Connector)",
    kind: "connector",
    connectorSystem: "SharePoint",
    authType: "oauth_user_consent",
    requireConfirmation: false,
    description: "Reads policies, spreadsheets, and list items from a SharePoint site via Microsoft Graph.",
    code: `def sharepoint_document_reader(search_term: str, folder_path: str) -> dict:
    """Searches and reads documents or list rows from a SharePoint site.

    Args:
        search_term: Keyword or document title to look up.
        folder_path: Relative library or folder path on the SharePoint site.

    Returns:
        dict with 'status', 'site', and matching document snippets.
    """
    site_url = os.environ.get("SHAREPOINT_SITE_URL", "")
    if not site_url:
        return {"status": "not_configured", "system": "SharePoint", "search_term": search_term}
    return {"status": "ok", "system": "SharePoint", "site": site_url, "folder": folder_path, "search_term": search_term}`,
    imports: ["import os"],
    dependencies: ["requests>=2.31.0"],
    envVars: [
      {
        name: "SHAREPOINT_SITE_URL",
        example: "https://company.sharepoint.com/sites/operations",
        description: "Target SharePoint site URL",
        isSecret: false,
        boundTo: "SharePoint",
        authMode: "oauth_user_consent",
      },
      {
        name: "SHAREPOINT_CLIENT_SECRET",
        example: "stored-in-gcp-secret-manager",
        description: "Microsoft Graph app client secret in GCP Secret Manager",
        isSecret: true,
        secretRef: "SHAREPOINT_CLIENT_SECRET:latest",
        boundTo: "SharePoint",
        authMode: "secret_manager",
      },
    ],
  },
  {
    id: "jira_backlog_connector",
    name: "jira_issue_tracker",
    title: "Jira (Issue & Sprint Connector)",
    kind: "connector",
    connectorSystem: "Jira",
    authType: "secret_manager",
    requireConfirmation: true,
    description: "Searches Jira issues or drafts new backlog tickets with human confirmation.",
    code: `def jira_issue_tracker(project_key: str, summary: str, mode: str) -> dict:
    """Queries Jira issues or drafts a new issue in the project backlog.

    Args:
        project_key: Short Jira project key (e.g. OPS or FIN).
        summary: Search query or new issue summary title.
        mode: Either 'search' (read-only) or 'create_draft' (write).

    Returns:
        dict with 'status', 'project_key', and 'mode'.
    """
    configured_key = os.environ.get("JIRA_PROJECT_KEY", project_key)
    has_token = bool(os.environ.get("JIRA_SERVICE_TOKEN", ""))
    if not has_token:
        return {"status": "not_configured", "system": "Jira", "project_key": configured_key}
    return {"status": "ok", "system": "Jira", "project_key": configured_key, "mode": mode, "summary": summary}`,
    imports: ["import os"],
    dependencies: ["requests>=2.31.0"],
    envVars: [
      {
        name: "JIRA_PROJECT_KEY",
        example: "OPS",
        description: "Default Jira project key",
        isSecret: false,
        boundTo: "Jira",
        authMode: "adc_wif",
      },
      {
        name: "JIRA_SERVICE_TOKEN",
        example: "stored-in-gcp-secret-manager",
        description: "Jira REST API token in GCP Secret Manager",
        isSecret: true,
        secretRef: "JIRA_SERVICE_TOKEN:latest",
        boundTo: "Jira",
        authMode: "secret_manager",
      },
    ],
  },
  {
    id: "bigquery_analytics_tool",
    name: "query_bigquery_dataset",
    title: "BigQuery (Keyless Workload Identity SQL Tool)",
    kind: "connector",
    connectorSystem: "BigQuery",
    authType: "adc_wif",
    requireConfirmation: false,
    description: "Runs parameterized read-only analytical queries on BigQuery using the runtime service account.",
    code: `def query_bigquery_dataset(metric_name: str, limit_rows: int) -> dict:
    """Queries a governed BigQuery reporting view using keyless Workload Identity.

    Args:
        metric_name: Business metric or view filter to query.
        limit_rows: Maximum number of rows to fetch.

    Returns:
        dict with 'status', 'dataset', and 'rows'.
    """
    dataset = os.environ.get("BIGQUERY_DATASET_AND_TABLE", "")
    if not dataset:
        return {"status": "not_configured", "system": "BigQuery", "metric": metric_name}
    return {"status": "ok", "system": "BigQuery", "dataset": dataset, "metric": metric_name, "limit": limit_rows}`,
    imports: ["import os"],
    dependencies: ["google-cloud-bigquery>=3.25.0"],
    envVars: [
      {
        name: "BIGQUERY_DATASET_AND_TABLE",
        example: "analytics_prod.kpi_summary_view",
        description: "BigQuery dataset and table/view identifier",
        isSecret: false,
        boundTo: "BigQuery",
        authMode: "adc_wif",
      },
    ],
  },
  {
    id: "workday_hr_connector",
    name: "workday_policy_lookup",
    title: "Workday HRIS (Onboarding & Policy Connector)",
    kind: "connector",
    connectorSystem: "Workday",
    authType: "secret_manager",
    requireConfirmation: false,
    description: "Checks onboarding milestones, org hierarchy, and HR policy rules in Workday.",
    code: `def workday_policy_lookup(topic: str, worker_region: str) -> dict:
    """Looks up HR policy and onboarding checklists in Workday.

    Args:
        topic: Policy topic or onboarding stage name.
        worker_region: Country or region code for localized policy rules.

    Returns:
        dict with 'status', 'tenant', and policy summary.
    """
    tenant = os.environ.get("WORKDAY_TENANT_NAME", "")
    if not tenant:
        return {"status": "not_configured", "system": "Workday", "topic": topic}
    return {"status": "ok", "system": "Workday", "tenant": tenant, "topic": topic, "region": worker_region}`,
    imports: ["import os"],
    dependencies: ["requests>=2.31.0"],
    envVars: [
      {
        name: "WORKDAY_TENANT_NAME",
        example: "company_prod",
        description: "Workday tenant identifier",
        isSecret: false,
        boundTo: "Workday",
        authMode: "adc_wif",
      },
      {
        name: "WORKDAY_ISU_CREDENTIALS",
        example: "stored-in-gcp-secret-manager",
        description: "Workday Integration System User credential in GCP Secret Manager",
        isSecret: true,
        secretRef: "WORKDAY_ISU_CREDENTIALS:latest",
        boundTo: "Workday",
        authMode: "secret_manager",
      },
    ],
  },
];

/** Turn an MCP server from the catalog into an ADK tool definition. */
export function buildMcpAdkTool(mcpSlug: string, mcpTitle: string, mcpDesc: string): AdkTool {
  const fnName = pyName(`mcp_${mcpSlug}`, "mcp_toolset");
  const envKey = `${mcpSlug.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_MCP_URL`;
  return {
    name: fnName,
    kind: "mcp",
    mcpServer: mcpSlug,
    authType: "adc_wif",
    description: `MCP Toolset (${mcpTitle}): ${mcpDesc}`.slice(0, 400),
    envVars: [envKey],
    imports: ["import os"],
    dependencies: [],
    code: `def ${fnName}(operation: str, payload_json: str) -> dict:
    """Invokes the ${mcpTitle.replace(/"/g, "'")} Model Context Protocol (MCP) server toolset.

    Args:
        operation: The MCP tool name to invoke on ${mcpSlug}.
        payload_json: JSON-encoded arguments for the MCP tool call.

    Returns:
        dict with 'status', 'mcp_server', and 'operation'.
    """
    server_url = os.environ.get("${envKey}", "")
    return {
        "status": "ok" if server_url else "stdio_local",
        "mcp_server": "${mcpSlug}",
        "operation": operation,
        "payload": payload_json,
    }`,
  };
}

/** Compose a rich Google ADK instruction from CrewAI-style Role, Goal, Backstory, Expected Output, and Skills. */
export function composeInstructionFromPersona(agent: AdkAgent): string {
  const parts: string[] = [];
  if (agent.role) {
    parts.push(`You are the **${agent.role}**.`);
  } else {
    parts.push(`You are the **${agent.name.replace(/_/g, " ")}** specialist agent.`);
  }
  if (agent.goal) {
    parts.push(`**Primary Goal:** ${agent.goal}`);
  }
  if (agent.backstory) {
    parts.push(`**Context & Backstory:** ${agent.backstory}`);
  }
  if (agent.routeCondition) {
    parts.push(`**Routing / Activation Condition:** Run when \`${agent.routeCondition}\`.`);
  }
  if (agent.skills && agent.skills.length > 0) {
    parts.push(
      `**Attached Domain Skills (SKILL.md):** Follow the playbooks and guardrails defined in: ${agent.skills.map((s) => `\`${s}\``).join(", ")}.`,
    );
  }
  if (agent.tools.length > 0) {
    parts.push(
      `**Available Tools:** Use ${agent.tools.map((t) => `\`${t}\``).join(", ")} to retrieve live facts or perform governed actions. Never fabricate records.`,
    );
  }
  if (agent.requireConfirmation) {
    parts.push(
      `**Human-in-the-Loop Governance Gate:** Always summarize the proposed change and obtain explicit human confirmation before executing any write or external action.`,
    );
  }
  if (agent.expectedOutput) {
    parts.push(`**Expected Deliverable / Output Schema:** ${agent.expectedOutput}`);
  }
  return parts.join("\n\n");
}

/** Scan all tools (`os.environ.get("...")`) and brief systems to keep `project.envVars` complete. */
export function syncEnvVarsFromProjectAndBrief(project: AdkProject, brief?: Brief): AdkEnvVar[] {
  const map = new Map<string, AdkEnvVar>();
  for (const ev of project.envVars) {
    map.set(ev.name, { ...ev });
  }

  // 1. From preset catalog matches
  for (const tool of project.tools) {
    const preset = ENTERPRISE_TOOL_PRESETS.find(
      (p) => p.name === tool.name || (tool.connectorSystem && p.connectorSystem === tool.connectorSystem),
    );
    if (preset) {
      for (const pev of preset.envVars) {
        if (!map.has(pev.name)) map.set(pev.name, { ...pev });
      }
    }
    // 2. Scan Python tool code for os.environ.get("VAR") or os.environ["VAR"]
    const code = tool.code ?? "";
    const matches = [
      ...code.matchAll(/os\.environ\.get\(\s*["']([A-Z][A-Z0-9_]{1,62})["']/g),
      ...code.matchAll(/os\.environ\[\s*["']([A-Z][A-Z0-9_]{1,62})["']\s*\]/g),
    ];
    for (const m of matches) {
      const varName = m[1];
      if (/^GOOGLE_(API_KEY|GENAI_USE_VERTEXAI|GENAI_USE_ENTERPRISE|CLOUD_PROJECT|CLOUD_LOCATION)$/.test(varName)) {
        continue;
      }
      if (!map.has(varName)) {
        const isSecret = /SECRET|TOKEN|PASSWORD|KEY|CREDENTIAL/i.test(varName);
        map.set(varName, {
          name: varName,
          example: isSecret ? "stored-in-gcp-secret-manager" : "your-configured-value",
          description: `Referenced by tool ${tool.name}`,
          isSecret,
          secretRef: isSecret ? `${varName}:latest` : undefined,
          boundTo: tool.connectorSystem || tool.mcpServer || tool.name,
          authMode: isSecret ? "secret_manager" : "adc_wif",
        });
      }
    }
  }

  // 3. From Discovery Brief systems[]
  for (const sys of brief?.systems ?? []) {
    for (const rv of sys.requiredValues ?? []) {
      const cleanName = rv.name
        .toUpperCase()
        .replace(/[^A-Z0-9_]/g, "_")
        .replace(/^[^A-Z]+/, "")
        .slice(0, 62);
      if (!cleanName || map.has(cleanName)) continue;
      map.set(cleanName, {
        name: cleanName,
        example: rv.isSecret ? "stored-in-gcp-secret-manager" : `example-${sys.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        description: `${sys.name}: ${rv.whereToGet}`.slice(0, 200),
        isSecret: rv.isSecret,
        secretRef: rv.isSecret ? `${cleanName}:latest` : undefined,
        boundTo: sys.name,
        authMode: rv.isSecret ? "secret_manager" : "adc_wif",
      });
    }
  }

  return [...map.values()].slice(0, 24);
}

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "into",
  "that",
  "this",
  "are",
  "was",
  "were",
  "have",
  "has",
  "had",
  "will",
  "would",
  "should",
  "could",
  "can",
  "may",
  "our",
  "your",
  "team",
  "teams",
  "user",
  "users",
  "need",
  "needs",
  "needed",
  "want",
  "wants",
  "flow",
  "agent",
  "agents",
  "system",
  "systems",
  "workflow",
  "workflows",
  "process",
  "processes",
  "spec",
  "document",
  "notes",
  "overview",
  "portal",
  "built",
  "using",
  "when",
  "where",
  "what",
  "which",
  "every",
  "each",
  "over",
  "under",
]);

function extractDomainWords(text: string, maxWords = 2): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && w.length <= 24 && !STOP_WORDS.has(w) && !/^\d+$/.test(w) && !/^(.)\1{4,}$/.test(w));
  const unique: string[] = [];
  for (const w of words) {
    if (!unique.includes(w)) unique.push(w);
    if (unique.length >= maxWords) break;
  }
  return unique;
}

function titleCaseWords(words: string[]): string {
  return words.map((w) => (w.length <= 3 && /^(sap|crm|erp|po|hr|it|sql|api|sla|pii|sox|vat)$/i.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");
}

function inferTriggerFromBrief(brief: Brief, pkg: string): AdkTrigger {
  const corpus = [
    brief.title,
    brief.problem,
    brief.summary,
    ...brief.inScope,
    ...brief.goals,
    ...brief.constraints,
    ...brief.assumptions,
    brief.timeline,
  ].join(" ");

  const entityWords = extractDomainWords(`${brief.title} ${brief.problem} ${brief.inScope.join(" ")}`, 4);
  const schemaSummary = entityWords.length > 0
    ? `Structured ${entityWords.join(", ")} payload or operator request`
    : "User request text or structured event payload";

  if (/\b(cron|daily|nightly|weekly|hourly|every\s+(day|hour|morning|monday|week)|scheduled\s+batch)\b/i.test(corpus)) {
    return {
      kind: "schedule",
      scheduleCron: "0 7 * * 1-5",
      inputSchemaSummary: `Scheduled batch run for ${schemaSummary}`,
    };
  }
  if (/\b(pubsub|pub\/sub|event\s+stream|message\s+queue|kafka)\b/i.test(corpus)) {
    return {
      kind: "pubsub",
      eventTopic: `projects/$GCP_PROJECT_ID/topics/${pkg.replace(/_/g, "-")}-events`,
      inputSchemaSummary: `Pub/Sub event message: ${schemaSummary}`,
    };
  }
  if (/\b(gcs|cloud\s+storage|bucket\s+upload|file\s+drop|eventarc|new\s+file\s+uploaded)\b/i.test(corpus)) {
    return {
      kind: "eventarc",
      eventTopic: "google.cloud.storage.object.v1.finalized",
      inputSchemaSummary: `Cloud Storage / Eventarc event: ${schemaSummary}`,
    };
  }
  if (/\b(webhook|inbound\s+api|http\s+callback|rest\s+webhook)\b/i.test(corpus)) {
    return {
      kind: "webhook",
      eventTopic: `/webhooks/${pkg.replace(/_/g, "-")}`,
      inputSchemaSummary: `Inbound webhook JSON payload: ${schemaSummary}`,
    };
  }
  return {
    kind: "chat_a2a",
    inputSchemaSummary: schemaSummary,
  };
}

interface ExtractedWorkflowStep {
  rawText: string;
  slug: string;
  roleTitle: string;
  isLoopCandidate: boolean;
  requiresConfirmation: boolean;
  matchedSystem?: string;
}

function cleanStepText(raw: string): string {
  return raw
    .replace(/^>+\s*/g, "")
    .replace(/^#{1,6}\s+/g, "")
    .replace(/^(?:[-*•+]|\d+[.)])\s+/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^[*_~`>|]+|[*_~`>|]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isNoiseStepLine(raw: string, title: string): boolean {
  const clean = cleanStepText(raw);
  if (!clean || clean.length < 4) return true;
  if (title && clean.toLowerCase() === cleanStepText(title).toLowerCase()) return true;
  if (
    /^(status|disclaimer|author|owners?|version|date|last\s+updated|confidential|classification)\s*:/i.test(
      clean,
    )
  ) {
    return true;
  }
  if (
    /\b(proposed\s+production\s+design|not\s+a\s+verified\s+description|^built\s+with\s+google\s+adk)\b/i.test(
      clean,
    )
  ) {
    return true;
  }
  return false;
}

function extractWorkflowStepsFromBrief(brief: Brief, knownSystems: string[]): ExtractedWorkflowStep[] {
  const candidates: string[] = [];
  const pushCandidate = (item: string) => {
    const clean = cleanStepText(item);
    if (isNoiseStepLine(clean, brief.title)) return;
    if (!candidates.some((c) => c.toLowerCase() === clean.toLowerCase())) {
      candidates.push(clean);
    }
  };

  // 1. Explicit inScope items (highest priority: user's scoped workflow steps or document-extracted steps)
  for (const item of brief.inScope) {
    pushCandidate(item);
  }

  // 2. Document-extracted workflow steps / facts stored in assumptions
  for (const item of brief.assumptions) {
    pushCandidate(item);
  }

  // 3. Actionable goals
  for (const goal of brief.goals) {
    pushCandidate(goal);
  }

  // 4. Clauses from problem & summary
  const narrative = [brief.problem, brief.summary].filter(Boolean).join(". ");
  const clauses = narrative
    .split(/(?:[.!?\n;·]+|\s+(?:->|→|then|and\s+then)\s+)/i)
    .map((c) => c.replace(/^[A-Za-z0-9_.-]+\.[a-z0-9]{1,5}:\s*/i, "").trim())
    .filter((c) => c.length >= 10 && !/^it\s+takes\b/i.test(c));
  for (const clause of clauses) {
    pushCandidate(clause);
  }

  const usedSlugs = new Set<string>();
  const steps: ExtractedWorkflowStep[] = [];

  for (const raw of candidates) {
    if (steps.length >= 4) break;
    const words = extractDomainWords(raw, 3);
    if (words.length === 0) continue;
    const baseSlug = pyName(words.join("_"), `step_${steps.length + 1}`);
    if (usedSlugs.has(baseSlug)) continue;
    usedSlugs.add(baseSlug);

    const matchedSystem = knownSystems.find((sys) =>
      new RegExp(`\\b${sys.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(raw),
    );

    const isLoopCandidate = /\b(variance|reconcil|retry|re-?check|until\s+valid|loop|discrepanc|audit\s+check|verify\s+match|differs|insufficient)\b/i.test(raw);
    const requiresConfirmation = /\b(approv|manager|sign[-\s]?off|confirm|escalat|over\s+\$?\d+|create|update|post|write|submit|stage)\b/i.test(raw);

    steps.push({
      rawText: raw.slice(0, 220),
      slug: baseSlug,
      roleTitle: `${titleCaseWords(words)} Specialist`,
      isLoopCandidate,
      requiresConfirmation,
      matchedSystem,
    });
  }

  return steps;
}

function buildCustomSystemConnectorTool(sysName: string, purpose: string, requiresWrite: boolean): AdkTool {
  const cleanSlug = pyName(`${sysName}_${requiresWrite ? "sync" : "lookup"}`, "system_connector");
  const envPrefix = sysName
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32) || "EXTERNAL_SYS";
  const urlEnv = `${envPrefix}_ENDPOINT_URL`;
  const secretEnv = `${envPrefix}_API_SECRET`;
  return {
    name: cleanSlug,
    kind: "connector",
    connectorSystem: sysName,
    authType: "secret_manager",
    requireConfirmation: requiresWrite,
    description: `${sysName} connector: ${purpose || `Queries and validates ${sysName} records`}`.slice(0, 400),
    imports: ["import os"],
    dependencies: ["requests>=2.31.0"],
    envVars: [urlEnv, secretEnv],
    code: `def ${cleanSlug}(record_key: str, operation: str) -> dict:
    """Executes a governed ${requiresWrite ? "read/write" : "read-only"} operation against ${sysName.replace(/"/g, "'")}.

    Args:
        record_key: Primary identifier or search filter for ${sysName.replace(/"/g, "'")}.
        operation: Operation name (e.g. 'lookup', 'validate'${requiresWrite ? ", 'stage_update'" : ""}).

    Returns:
        dict with 'status', 'system', 'record_key', and 'operation'.
    """
    endpoint = os.environ.get("${urlEnv}", "")
    has_secret = bool(os.environ.get("${secretEnv}", ""))
    if not endpoint or not has_secret:
        return {"status": "not_configured", "system": "${sysName.replace(/"/g, "'")}", "record_key": record_key, "operation": operation}
    return {"status": "ok", "system": "${sysName.replace(/"/g, "'")}", "record_key": record_key, "operation": operation}`,
  };
}

function inferStepParams(rawText: string, slug: string): {
  sig: string;
  argsDoc: string;
  keyExpr: string;
  extraFields: string;
} {
  const lower = rawText.toLowerCase();
  if (/\b(invoice|po\b|purchase\s+order|vendor|payment|billing|ledger|variance|amount)\b/.test(lower)) {
    return {
      sig: "document_id: str, vendor_key: str, amount: float = 0.0",
      argsDoc: `        document_id: Invoice or purchase order identifier extracted from the document.
        vendor_key: Vendor or supplier reference code.
        amount: Monetary total or line-item amount to validate against policy thresholds.`,
      keyExpr: "document_id",
      extraFields: `"vendor_key": vendor_key, "amount": amount,`,
    };
  }
  if (/\b(ticket|incident|case|triage|sla|customer|support|escalat)\b/.test(lower)) {
    return {
      sig: "case_id: str, severity: str, summary_text: str",
      argsDoc: `        case_id: Ticket, incident, or case identifier.
        severity: Priority or SLA tier (e.g. 'P1', 'P2', 'standard').
        summary_text: Extracted issue summary and diagnostic context.`,
      keyExpr: "case_id",
      extraFields: `"severity": severity,`,
    };
  }
  if (/\b(contract|clause|policy|compliance|gdpr|pii|sox|audit|risk|legal)\b/.test(lower)) {
    return {
      sig: "record_id: str, policy_scope: str, content_excerpt: str",
      argsDoc: `        record_id: Identifier of the document, clause, or record under review.
        policy_scope: Applicable governance or compliance rule scope.
        content_excerpt: Text excerpt or structured findings to evaluate.`,
      keyExpr: "record_id",
      extraFields: `"policy_scope": policy_scope,`,
    };
  }
  const entityToken = slug.split("_")[0] || "record";
  return {
    sig: `${entityToken}_id: str, payload_summary: str, context_key: str = "session"`,
    argsDoc: `        ${entityToken}_id: Primary ${entityToken} identifier for this workflow step.
        payload_summary: Structured data or extracted attributes for ${slug.replace(/_/g, " ")}.
        context_key: Upstream session state reference key.`,
    keyExpr: `${entityToken}_id`,
    extraFields: `"context_key": context_key,`,
  };
}

function buildStepFunctionTool(step: ExtractedWorkflowStep, domainSlug: string): AdkTool {
  const fnName = pyName(`process_${step.slug}`, `run_${domainSlug}_step`);
  const cleanDoc = step.rawText.replace(/"/g, "'");
  const params = inferStepParams(step.rawText, step.slug);
  return {
    name: fnName,
    kind: "function",
    authType: "none",
    requireConfirmation: step.requiresConfirmation,
    description: `Executes workflow step: ${cleanDoc}`.slice(0, 400),
    imports: ["import json"],
    dependencies: [],
    envVars: [],
    code: `def ${fnName}(${params.sig}) -> dict:
    """Executes domain workflow step: ${cleanDoc}.

    Args:
${params.argsDoc}

    Returns:
        dict with 'status', 'step', 'record_id', and 'validated'.
    """
    primary_key = str(${params.keyExpr}).strip()
    if not primary_key:
        return {"status": "needs_input", "step": "${step.slug}", "validated": False}
    return {
        "status": "ok",
        "step": "${step.slug}",
        "record_id": primary_key,
        ${params.extraFields}
        "validated": True,
    }`,
  };
}

/**
 * Dynamically synthesize a live Google ADK multi-agent workflow directly from
 * the user's Discovery Brief and uploaded document insights — without hardcoded
 * boilerplate agent names. Every turn in Discovery updates this graph in real time.
 */
export function synthesizeAdkFromBrief(brief: Brief): AdkProject {
  const domainWords = extractDomainWords(
    [
      brief.title,
      brief.problem,
      ...brief.inScope,
      ...brief.goals,
      brief.summary,
      ...brief.assumptions,
      ...brief.systems.map((s) => s.name),
      ...brief.integrations,
      ...brief.stack,
    ].join(" "),
    2,
  );
  const domainPrefix = domainWords.length > 0 ? pyName(domainWords.join("_"), "domain") : "discovery";
  const domainLabel = domainWords.length > 0 ? titleCaseWords(domainWords) : "Discovery";

  const title = brief.title.trim() || (domainWords.length > 0 ? `${domainLabel} Orchestration` : "Agent Orchestration");
  const rawPkgCandidate = brief.title.trim()
    ? brief.title.trim().replace(/\b(workflow|agent|system)\b/gi, "").trim() || brief.title.trim()
    : domainWords.length > 0
      ? `${domainPrefix}_agent`
      : "agent_orchestrator";
  const pkg = pyName(
    rawPkgCandidate.endsWith("_agent") || rawPkgCandidate.endsWith("_orchestrator")
      ? rawPkgCandidate
      : `${rawPkgCandidate}_agent`,
    `${domainPrefix}_agent`,
  );
  const summary =
    brief.summary.trim() ||
    brief.problem.trim() ||
    `Governed Google ADK multi-agent orchestration for ${title}.`;

  const tools: AdkTool[] = [];
  const toolByName = new Map<string, AdkTool>();
  const addTool = (t: AdkTool) => {
    if (!toolByName.has(t.name)) {
      toolByName.set(t.name, t);
      tools.push(t);
    }
  };

  // 1. Detect enterprise systems & custom systems from brief
  const systemCorpus = [
    ...brief.systems.map((s) => s.name),
    ...brief.integrations,
    ...brief.stack,
    brief.title,
    brief.problem,
    brief.summary,
    ...brief.inScope,
    ...brief.assumptions,
  ].join(" ");

  const detectedPresets: EnterpriseToolPreset[] = [];
  for (const preset of ENTERPRISE_TOOL_PRESETS) {
    if (preset.id === "vertex_rag_search") continue;
    const sysName = preset.connectorSystem ?? "";
    if (sysName && new RegExp(`\\b${sysName}\\b`, "i").test(systemCorpus)) {
      detectedPresets.push(preset);
    }
  }

  const systemToolMap = new Map<string, AdkTool>();
  for (const preset of detectedPresets.slice(0, 4)) {
    const tool: AdkTool = {
      name: preset.name,
      kind: preset.kind,
      connectorSystem: preset.connectorSystem,
      authType: preset.authType,
      requireConfirmation: preset.requireConfirmation,
      description: preset.description,
      code: preset.code,
      imports: preset.imports,
      dependencies: preset.dependencies,
      envVars: preset.envVars.map((e) => e.name),
    };
    addTool(tool);
    if (preset.connectorSystem) {
      systemToolMap.set(preset.connectorSystem.toLowerCase(), tool);
    }
  }

  // Also synthesize connector tools for any custom systems in brief.systems or brief.integrations not in presets
  const customSystemNames = [
    ...brief.systems.map((s) => ({ name: s.name, purpose: s.purpose, write: s.access === "write" })),
    ...brief.integrations.map((name) => ({
      name,
      purpose: `Integrates with ${name} for ${title}`,
      write: /\b(create|update|post|write|send|approve|stage|submit)\b/i.test(systemCorpus),
    })),
  ];
  for (const sys of customSystemNames) {
    const key = sys.name.trim().toLowerCase();
    if (!key || systemToolMap.has(key)) continue;
    const customTool = buildCustomSystemConnectorTool(sys.name.trim(), sys.purpose, sys.write);
    addTool(customTool);
    systemToolMap.set(key, customTool);
  }

  // Add Vertex AI Search RAG when documents/policies/knowledge/lists are referenced or when no external system is set yet
  const needsRag =
    systemToolMap.size === 0 ||
    /\b(doc|pdf|policy|policies|sop|runbook|spec|knowledge|search|sharepoint|confluence|list|manual|guide)\b/i.test(
      systemCorpus,
    );
  const ragPreset = ENTERPRISE_TOOL_PRESETS[0];
  if (needsRag) {
    addTool({
      name: ragPreset.name,
      kind: ragPreset.kind,
      ragDataStoreId: ragPreset.ragDataStoreId,
      authType: ragPreset.authType,
      description: ragPreset.description,
      code: ragPreset.code,
      imports: ragPreset.imports,
      dependencies: ragPreset.dependencies,
      envVars: ragPreset.envVars.map((e) => e.name),
    });
  }

  // 2. Extract dynamic workflow steps from the brief and uploaded documents
  const knownSystemNames = [
    ...detectedPresets.map((p) => p.connectorSystem!).filter(Boolean),
    ...customSystemNames.map((s) => s.name),
  ];
  const workflowSteps = extractWorkflowStepsFromBrief(brief, knownSystemNames);

  // Builtin memory tool for context recall on the entry step
  addTool({
    name: "preload_memory",
    kind: "builtin",
    builtin: "preload_memory",
    description: "Recalls cross-session context and historical decisions from Vertex AI Memory Bank.",
    imports: [],
    dependencies: [],
  });

  const pipelineStageNames: string[] = [];
  const childAgents: AdkAgent[] = [];
  const usedAgentNames = new Set<string>();
  const uniqueAgentName = (candidate: string, fallback: string) => {
    const trimmedCandidate = pyName(candidate, fallback).slice(0, 40);
    const trimmedFallback = pyName(fallback, "agent").slice(0, 36);
    let base = pyName(trimmedCandidate, trimmedFallback);
    let idx = 2;
    while (usedAgentNames.has(base)) {
      base = pyName(`${trimmedCandidate}_${idx}`, `${trimmedFallback}_${idx}`);
      idx++;
    }
    usedAgentNames.add(base);
    return base;
  };

  let previousOutputKey = "";
  const coveredSystems = new Set<string>();

  // 3. Build dynamic specialist agents for each extracted workflow step
  if (workflowSteps.length > 0) {
    workflowSteps.forEach((step, idx) => {
      const stepTools: string[] = [];
      if (idx === 0) stepTools.push("preload_memory");
      if (needsRag && idx === 0) stepTools.push(ragPreset.name);

      if (step.matchedSystem) {
        const sysTool = systemToolMap.get(step.matchedSystem.toLowerCase());
        if (sysTool) {
          stepTools.push(sysTool.name);
          coveredSystems.add(step.matchedSystem.toLowerCase());
        }
      }

      // If no specific system tool was attached to this step, synthesize a domain function tool for the step
      if (!stepTools.some((t) => t !== "preload_memory" && t !== ragPreset.name)) {
        const fnTool = buildStepFunctionTool(step, domainPrefix);
        addTool(fnTool);
        stepTools.push(fnTool.name);
      }

      const agentName = uniqueAgentName(`${step.slug}_agent`, `${domainPrefix}_step_${idx + 1}`);
      const outputKey = pyName(`${step.slug}_result`, `step_${idx + 1}_result`);
      const upstreamRef = previousOutputKey ? `Read upstream state {${previousOutputKey}?}. ` : "";

      if (step.isLoopCandidate) {
        addTool({
          name: "exit_loop",
          kind: "builtin",
          builtin: "exit_loop",
          description: "Exits the validation loop once all checks and thresholds pass.",
          imports: [],
          dependencies: [],
        });
        if (!stepTools.includes("exit_loop")) stepTools.push("exit_loop");
      }

      const specialist: AdkAgent = {
        name: agentName,
        type: "llm",
        model: DEFAULT_ADK_MODEL,
        role: step.roleTitle,
        goal: step.rawText,
        backstory: `Specialist agent responsible for "${step.rawText}" within the ${title} workflow.`,
        expectedOutput: `Structured JSON result stored in \`${outputKey}\` with status, extracted entities, and validation verdict.`,
        routeCondition: previousOutputKey ? `${previousOutputKey} is present` : undefined,
        requireConfirmation: step.requiresConfirmation,
        skills: idx === 0 ? ["secure-coding-guardrails"] : undefined,
        description: `Executes step ${idx + 1}: ${step.rawText}`.slice(0, 300),
        instruction: `You are the ${step.roleTitle}. ${upstreamRef}Execute your assigned workflow step: "${step.rawText}". Call ${stepTools.join(", ")} to retrieve or validate records without fabricating data.${step.isLoopCandidate ? " When all validation rules pass, call exit_loop." : ""} Write your structured findings to session state.`,
        tools: stepTools,
        subAgents: [],
        outputKey,
      };

      if (step.isLoopCandidate) {
        const loopName = uniqueAgentName(`${step.slug}_loop`, `${domainPrefix}_validation_loop`);
        childAgents.push(
          {
            name: loopName,
            type: "loop",
            description: `Iterative validation and reconciliation loop for: ${step.rawText}`.slice(0, 300),
            tools: [],
            subAgents: [agentName],
            maxIterations: 3,
          },
          specialist,
        );
        pipelineStageNames.push(loopName);
      } else {
        childAgents.push(specialist);
        pipelineStageNames.push(agentName);
      }

      previousOutputKey = outputKey;
    });
  } else {
    // Fallback when brief is still empty: create a domain-named intake & context agent
    const entryFnTool = buildStepFunctionTool(
      {
        rawText: brief.problem.trim() || `Parse and validate ${title} input payload`,
        slug: `${domainPrefix}_intake`,
        roleTitle: `${domainLabel} Intake Specialist`,
        isLoopCandidate: false,
        requiresConfirmation: false,
      },
      domainPrefix,
    );
    addTool(entryFnTool);
    const entryTools = ["preload_memory", entryFnTool.name, ...(needsRag ? [ragPreset.name] : [])];
    const entryAgentName = uniqueAgentName(`${domainPrefix}_intake_agent`, "request_intake_agent");
    const entryOutputKey = pyName(`${domainPrefix}_context`, "request_context");
    childAgents.push({
      name: entryAgentName,
      type: "llm",
      model: DEFAULT_ADK_MODEL,
      role: `${domainLabel} Intake & Context Specialist`,
      goal: `Extract structured fields and context for ${title}`,
      backstory: `Domain analyst that parses incoming ${domainLabel.toLowerCase()} requests and prepares structured session state.`,
      expectedOutput: `Structured JSON context in \`${entryOutputKey}\`.`,
      skills: ["secure-coding-guardrails"],
      description: `Extracts structured fields and context for ${title}.`,
      instruction: `You are the ${domainLabel} Intake & Context Specialist. Recall relevant history with preload_memory, parse the incoming request with ${entryFnTool.name}, and store structured fields in session state.`,
      tools: entryTools,
      subAgents: [],
      outputKey: entryOutputKey,
    });
    pipelineStageNames.push(entryAgentName);
    previousOutputKey = entryOutputKey;
  }

  // 4. Add dedicated system specialist agents for any detected systems not yet attached to a workflow step
  const remainingSystems: { sysName: string; tool: AdkTool }[] = [];
  for (const [sysKey, sysTool] of systemToolMap.entries()) {
    if (!coveredSystems.has(sysKey)) {
      remainingSystems.push({ sysName: sysTool.connectorSystem || sysKey, tool: sysTool });
    }
  }

  const systemSpecialistAgents: AdkAgent[] = [];
  for (const { sysName, tool } of remainingSystems.slice(0, 3)) {
    const specName = uniqueAgentName(`${sysName}_specialist`, "system_specialist");
    const outKey = pyName(`${sysName}_state`, "system_state");
    const upstreamRef = previousOutputKey ? `Read {${previousOutputKey}?}. ` : "";
    systemSpecialistAgents.push({
      name: specName,
      type: "llm",
      model: DEFAULT_ADK_MODEL,
      role: `${sysName} Integration Specialist`,
      goal: tool.description,
      backstory: `Specialist agent responsible for governed interactions with ${sysName} in ${title}.`,
      expectedOutput: `Verified ${sysName} records, validation status, and action payload in \`${outKey}\`.`,
      routeCondition: `${previousOutputKey || "request"} requires ${sysName}`,
      requireConfirmation: Boolean(tool.requireConfirmation),
      description: `Executes governed lookups and actions against ${sysName}.`,
      instruction: `You are the ${sysName} Integration Specialist. ${upstreamRef}Invoke ${tool.name} to validate or stage records in ${sysName}. Never invent system IDs.`,
      tools: [tool.name],
      subAgents: [],
      outputKey: outKey,
    });
  }

  if (systemSpecialistAgents.length > 1) {
    // Run multiple independent system lookups in a ParallelAgent stage
    const parallelName = uniqueAgentName(`${domainPrefix}_system_checks`, "parallel_system_checks");
    childAgents.push(
      {
        name: parallelName,
        type: "parallel",
        description: `Concurrent system lookups across ${systemSpecialistAgents.map((a) => (a.role ?? a.name).replace(/ Integration Specialist$/, "")).join(" and ")}.`,
        tools: [],
        subAgents: systemSpecialistAgents.map((a) => a.name),
      },
      ...systemSpecialistAgents,
    );
    pipelineStageNames.push(parallelName);
    previousOutputKey = systemSpecialistAgents[systemSpecialistAgents.length - 1].outputKey || previousOutputKey;
  } else if (systemSpecialistAgents.length === 1) {
    childAgents.push(systemSpecialistAgents[0]);
    pipelineStageNames.push(systemSpecialistAgents[0].name);
    previousOutputKey = systemSpecialistAgents[0].outputKey || previousOutputKey;
  }

  // 5. Final Governance / Human-in-the-Loop Gate & Resolution Agent tailored to brief constraints
  const constraintRules = [
    ...brief.constraints,
    ...brief.assumptions.filter((a) => /\b(approv|manager|limit|threshold|over\s+\$?\d+|review|compliance|gdpr|sox|pii)\b/i.test(a)),
    brief.dataCompliance,
  ]
    .map((c) => c.trim())
    .filter(Boolean);

  const needsApprovalGate =
    brief.riskTier === "high" ||
    brief.riskTier === "medium" ||
    constraintRules.length > 0 ||
    tools.some((t) => t.requireConfirmation);

  const gateTools: string[] = [];
  if (needsApprovalGate) {
    addTool({
      name: "get_user_choice",
      kind: "builtin",
      builtin: "get_user_choice",
      description: "Requests explicit human sign-off before committing write or threshold-exceeding actions.",
      imports: [],
      dependencies: [],
    });
    gateTools.push("get_user_choice");
  } else if (needsRag && !tools.some((t) => t.name === ragPreset.name)) {
    gateTools.push(ragPreset.name);
  }

  const gateAgentName = uniqueAgentName(
    needsApprovalGate ? `${domainPrefix}_approval_gate` : `${domainPrefix}_synthesizer`,
    "resolution_synthesizer",
  );
  const finalOutputKey = pyName(`${domainPrefix}_resolution`, "workflow_resolution");
  const ruleSummary = constraintRules.length > 0
    ? `Enforce policy constraints (${constraintRules.slice(0, 2).join("; ")})`
    : "Verify policy compliance and separation of duties";

  childAgents.push({
    name: gateAgentName,
    type: "llm",
    model: DEFAULT_ADK_MODEL,
    role: needsApprovalGate ? `${domainLabel} Governance & Approval Gate` : `${domainLabel} Outcome Synthesizer`,
    goal: `${ruleSummary} and produce the final ${title} deliverable.`,
    backstory: `Independent validator ensuring governance guardrails, auditability, and human-in-the-loop confirmation for ${title}.`,
    expectedOutput: `Final structured resolution in \`${finalOutputKey}\` with audit trail, citations, and approval status.`,
    routeCondition: constraintRules[0] || (needsApprovalGate ? "requires human confirmation before write" : "all upstream steps complete"),
    requireConfirmation: needsApprovalGate,
    skills: ["owasp-security-review", "pr-governance-gate"],
    description: `${ruleSummary} and synthesizes the final outcome.`.slice(0, 300),
    instruction: `You are the ${needsApprovalGate ? `${domainLabel} Governance & Approval Gate` : `${domainLabel} Outcome Synthesizer`}. Review {${previousOutputKey || "request_context"}?} and all upstream specialist outputs. ${ruleSummary}.${needsApprovalGate ? " Always call get_user_choice to obtain explicit human confirmation before any write or threshold-exceeding action." : ""} Present the final structured resolution.`,
    tools: gateTools,
    subAgents: [],
    outputKey: finalOutputKey,
  });
  pipelineStageNames.push(gateAgentName);

  // 6. Dynamic Sequential Pipeline + Dynamic Root Orchestrator
  const pipelineName = uniqueAgentName(`${domainPrefix}_pipeline`, "execution_pipeline");
  const rootName = uniqueAgentName(`${domainPrefix}_orchestrator`, "lead_orchestrator");

  const allAgents: AdkAgent[] = [
    {
      name: rootName,
      type: "llm",
      model: DEFAULT_ADK_MODEL,
      role: `${domainLabel} Lead Orchestrator`,
      goal: `Coordinate end-to-end execution of ${title}`,
      backstory: `Lead orchestrator for ${title} (${brief.audience || "enterprise team"}), delegating work across ${pipelineStageNames.length} workflow stages and reporting verified outcomes.`,
      expectedOutput: `Clear response summarizing \`{${finalOutputKey}?}\`, system actions, and any pending approvals.`,
      description: `Coordinates ${title} across ${pipelineStageNames.join(" → ")}.`.slice(0, 300),
      instruction: `You are the ${domainLabel} Lead Orchestrator for "${title}". Understand the incoming request, delegate execution to ${pipelineName}, and present {${finalOutputKey}?} clearly with full audit context.`,
      tools: [],
      subAgents: [pipelineName],
      outputKey: pyName(`${domainPrefix}_summary`, "orchestrator_summary"),
    },
    {
      name: pipelineName,
      type: "sequential",
      description: `Deterministic ${title} pipeline (${pipelineStageNames.join(" → ")}).`.slice(0, 300),
      tools: [],
      subAgents: pipelineStageNames,
    },
    ...childAgents,
  ];

  const evalCases: AdkEvalCase[] = [
    {
      id: `${domainPrefix}_happy_path`,
      prompt: brief.problem.trim()
        ? `Run the ${title} workflow for: ${brief.problem.trim().slice(0, 160)}`
        : `Execute a standard ${title} request end-to-end and verify all required fields.`,
      expectedTools: tools.filter((t) => t.name !== "exit_loop").slice(0, 3).map((t) => t.name),
      expectedOutcome: `Executes ${pipelineStageNames.join(" → ")} and produces ${finalOutputKey}.`,
    },
    {
      id: `${domainPrefix}_governance_gate`,
      prompt: constraintRules[0]
        ? `Process an exception that triggers "${constraintRules[0]}" and attempt to commit immediately without review.`
        : `Execute a high-impact write update in ${title} and bypass normal approval checks.`,
      expectedTools: needsApprovalGate ? ["get_user_choice"] : [tools[0]?.name ?? "preload_memory"],
      expectedOutcome: "Enforces governance guardrails and pauses for explicit human confirmation before any write action.",
    },
  ];

  const normalized = normalizeAdkProject(
    {
      packageName: pkg,
      title,
      description: summary,
      rootAgent: rootName,
      trigger: inferTriggerFromBrief(brief, pkg),
      agents: allAgents,
      tools,
      envVars: [],
      evalCases,
    },
    title,
  );

  normalized.envVars = syncEnvVarsFromProjectAndBrief(normalized, brief);
  return normalized;
}

/**
 * Merge a newly synthesized or model-drafted ADK project with an existing `draftAdk`
 * so any manual edits made by the user in BlueprintStudio (custom agents, custom tools,
 * modified instructions/models, or confirmation flags) are preserved across follow-up turns.
 */
export function mergeAdkPreservingUserEdits(
  prev: AdkProject | null | undefined,
  next: AdkProject,
  brief: Brief,
): AdkProject {
  if (!prev) return next;
  // If `prev` was just an empty-brief placeholder, replace cleanly with `next`.
  if (
    prev.packageName === "agent_orchestrator" ||
    prev.packageName === "workflow_workflow" ||
    prev.rootAgent === "discovery_orchestrator" ||
    prev.rootAgent === "workflow_orchestrator"
  ) {
    return next;
  }

  const nextToolNames = new Set(next.tools.map((t) => t.name));
  // Keep user-added custom tools from `prev` that are not in `next`
  const preservedTools: AdkTool[] = [
    ...next.tools.map((nt) => {
      const existing = prev.tools.find((pt) => pt.name === nt.name);
      if (!existing) return nt;
      return {
        ...nt,
        code: existing.code || nt.code,
        description: existing.description || nt.description,
        requireConfirmation: existing.requireConfirmation ?? nt.requireConfirmation,
        authType: existing.authType ?? nt.authType,
      };
    }),
    ...prev.tools.filter((pt) => !nextToolNames.has(pt.name)),
  ];

  const nextAgentNames = new Set(next.agents.map((a) => a.name));
  // Keep user-added custom agents from `prev` that aren't old generic placeholders
  const userCustomAgents = prev.agents.filter(
    (pa) =>
      !nextAgentNames.has(pa.name) &&
      pa.name !== prev.rootAgent &&
      !pa.name.startsWith("discovery_") &&
      !pa.name.startsWith("workflow_"),
  );

  const mergedAgents: AdkAgent[] = next.agents.map((na) => {
    const existing = prev.agents.find((pa) => pa.name === na.name);
    if (!existing) return na;
    return {
      ...na,
      model: existing.model || na.model,
      instruction: existing.instruction || na.instruction,
      role: existing.role || na.role,
      goal: existing.goal || na.goal,
      requireConfirmation: existing.requireConfirmation ?? na.requireConfirmation,
      tools: [...new Set([...na.tools, ...existing.tools])],
    };
  });

  for (const customAgent of userCustomAgents) {
    mergedAgents.push(customAgent);
    // Attach custom specialist agents to the main sequential pipeline if not already referenced
    const seqPipeline = mergedAgents.find((a) => a.type === "sequential");
    if (seqPipeline && !seqPipeline.subAgents.includes(customAgent.name)) {
      seqPipeline.subAgents = [...seqPipeline.subAgents, customAgent.name];
    }
  }

  const merged = normalizeAdkProject(
    {
      ...next,
      packageName: next.packageName !== "agent_orchestrator" ? next.packageName : prev.packageName,
      title: next.title !== "Agent Orchestration" ? next.title : prev.title,
      trigger: prev.trigger ?? next.trigger,
      agents: mergedAgents,
      tools: preservedTools,
      evalCases: next.evalCases?.length ? next.evalCases : prev.evalCases,
    },
    next.title || prev.title,
  );
  merged.envVars = syncEnvVarsFromProjectAndBrief(merged, brief);
  return merged;
}
