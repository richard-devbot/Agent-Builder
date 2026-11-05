/**
 * Domain contracts for the Procurement Resolution Hub —
 * An AI-assisted workbench for resolving blocked invoices and purchasing exceptions,
 * built with Google ADK and integrated with Coupa and approved enterprise systems.
 */

export type ExceptionCategory =
  | "MISSING_RECEIPT"
  | "PRICE_MISMATCH"
  | "QUANTITY_MISMATCH"
  | "INSUFFICIENT_PO_BALANCE"
  | "MISSING_INVOICE_INFO";

export type CaseState =
  | "Detected"
  | "Investigating"
  | "Ready for review"
  | "Needs more information"
  | "Unsupported / escalated"
  | "Approved action"
  | "Awaiting response"
  | "Rechecking"
  | "Resolved";

/**
 * Section 3 requirement:
 * "The interface must distinguish verified facts, AI interpretation, and unresolved uncertainty."
 */
export type EpistemicTag =
  | "verified_fact"
  | "ai_interpretation"
  | "unresolved_uncertainty";

/**
 * Section 2 — Explicitly prohibited actions in the initial release.
 * Autonomy is granted per action—not per agent.
 */
export type ProhibitedActionType =
  | "APPROVE_INVOICE"
  | "RELEASE_PAYMENT"
  | "CHANGE_SUPPLIER_BANK"
  | "MODIFY_PO_PRICE_QTY"
  | "AUTO_RECORD_RECEIPT"
  | "AI_AS_FINANCIAL_AUTH";

/**
 * Section 2 & 6 — Permitted actions that can be proposed by the Resolution Planner
 * and routed through human approval to the Policy & Action Gateway.
 */
export type PermittedActionType =
  | "REQUEST_RECEIPT_CONFIRMATION"
  | "SEND_PRICE_VARIANCE_INQUIRY"
  | "SEND_QUANTITY_VARIANCE_INQUIRY"
  | "LOG_TOLERANCE_VERIFICATION_AND_RECHECK"
  | "ROUTE_TO_AP_TRIAGE"
  | "REQUEST_MORE_INFORMATION"
  | "ESCALATE_UNSUPPORTED_EXCEPTION";

export type DepartmentScope =
  | "IT Infrastructure"
  | "Cloud Operations"
  | "Security Engineering"
  | "Datacenter Ops"
  | "Global Marketing"
  | "Facilities";

export type PersonaId =
  | "ap-analyst-global"
  | "buyer-it-cloud"
  | "finance-controller"
  | "citizen-sandbox";

export interface PersonaProfile {
  id: PersonaId;
  name: string;
  roleTitle: string;
  actorHandle: string;
  allowedDepartments: DepartmentScope[];
  canApproveStandard: boolean;
  canApproveHighValue: boolean;
  canExecuteGateway: boolean;
  canManualClose: boolean;
  readOnlyReason?: string;
}

export interface CoupaInvoiceLine {
  lineNumber: number;
  poLineNumber: number;
  itemCode: string;
  description: string;
  quantityInvoiced: number;
  unitOfMeasure: string;
  unitPriceCents: number;
  lineSubtotalCents: number;
  taxCents: number;
  freightCents: number;
}

export interface PriorInvoiceSummary {
  invoiceId: string;
  invoiceDate: string;
  poLineNumber: number;
  quantityBilled: number;
  subtotalCents: number;
  status: "Approved" | "Paid" | "Pending";
}

export interface CoupaInvoice {
  invoiceId: string;
  supplierInvoiceNumber: string;
  supplierId: string;
  supplierName: string;
  poId: string;
  currency: "USD" | "EUR" | "GBP";
  issueDate: string;
  dueDate: string;
  receivedAt: string;
  coupaStatus:
    | "On Hold — Missing Receipt"
    | "On Hold — Price Variance"
    | "On Hold — Quantity Variance"
    | "On Hold — PO Balance Exceeded"
    | "On Hold — Missing Coding"
    | "Ready to Pay";
  subtotalCents: number;
  taxCents: number;
  freightCents: number;
  totalCents: number;
  lines: CoupaInvoiceLine[];
  supplierMemo?: string;
  sourceUrl: string;
  lastSyncedAt: string;
  sourceVersion: number;
}

export interface CoupaPOLine {
  poLineNumber: number;
  itemCode: string;
  description: string;
  quantityOrdered: number;
  unitOfMeasure: string;
  unitPriceCents: number;
  lineTotalCents: number;
  lineStatus: "Open" | "Closed" | "Canceled";
  needByDate: string;
}

export interface CoupaPurchaseOrder {
  poId: string;
  requisitionId: string;
  supplierId: string;
  supplierName: string;
  department: DepartmentScope;
  costCenter: string;
  currency: "USD" | "EUR" | "GBP";
  poStatus: "Issued" | "Partially Received" | "Fully Received" | "Closed" | "Canceled";
  totalAuthorizedCents: number;
  totalConsumedPriorCents: number;
  lines: CoupaPOLine[];
  priorInvoices: PriorInvoiceSummary[];
  sourceUrl: string;
}

export interface CoupaReceiptLine {
  receiptId: string;
  poLineNumber: number;
  quantityReceived: number;
  receivedByHandle: string;
  receivedDate: string;
  conditionNote?: string;
}

export interface CoupaReceipt {
  receiptId: string;
  poId: string;
  receivedDate: string;
  status: "Confirmed" | "Partial" | "Draft";
  lines: CoupaReceiptLine[];
  sourceUrl: string;
}

export interface ApprovalPolicy {
  policyId: string;
  title: string;
  topic: "missing_receipt" | "price_tolerance" | "quantity_tolerance" | "multi_invoice_po" | "scope_boundary" | "prompt_injection_defense";
  version: string;
  effectiveDate: string;
  maxUnitPriceVariancePct: number;
  maxAbsoluteVarianceCents: number;
  roundingToleranceCents: number;
  passage: string;
  prohibitions: string[];
}

export interface OwnershipRecord {
  recordId: string;
  costCenter: string;
  department: DepartmentScope;
  ownerName: string;
  ownerHandle: string;
  ownerRole: string;
  backupHandle: string;
  directoryStatus: "Active" | "Conflicting" | "Unassigned";
  routingQueue: string;
  conflictDetail?: string;
}

export interface LineDeterministicComparison {
  lineNumber: number;
  poLineNumber: number;
  itemCode: string;
  description: string;
  poLineStatus: "Open" | "Closed" | "Canceled";
  orderedQty: number;
  priorInvoicedQty: number;
  currentInvoicedQty: number;
  cumulativeInvoicedQty: number;
  receivedQty: number;
  unreceivedInvoicedQty: number;
  overBilledAgainstPoQty: number;
  poUnitPriceCents: number;
  invoiceUnitPriceCents: number;
  unitPriceDeltaCents: number;
  unitPriceDeltaPct: number;
  lineSubtotalDeltaCents: number;
  withinPriceTolerance: boolean;
  withinRoundingTolerance: boolean;
  receiptMatchStatus: "FULL_RECEIPT" | "PARTIAL_RECEIPT" | "NO_RECEIPT";
  lineFinding: string;
}

/**
 * BR-03: Deterministic financial calculations and approved tolerances.
 */
export interface DeterministicComparison {
  currency: "USD" | "EUR" | "GBP";
  poTotalAuthorizedCents: number;
  priorInvoicesTotalCents: number;
  currentInvoiceSubtotalCents: number;
  currentInvoiceTaxCents: number;
  currentInvoiceFreightCents: number;
  currentInvoiceTotalCents: number;
  remainingPoBalanceBeforeInvoiceCents: number;
  remainingPoBalanceAfterInvoiceCents: number;
  totalPriceVarianceCents: number;
  totalPriceVariancePct: number;
  totalUnreceivedValueCents: number;
  hasPartialReceipt: boolean;
  hasMultipleInvoiceLines: boolean;
  hasMultipleInvoicesAgainstPo: boolean;
  withinPolicyTolerance: boolean;
  withinCurrencyRounding: boolean;
  appliedPolicyId: string;
  appliedPolicyVersion: string;
  deterministicVerdict:
    | "WITHIN_TOLERANCE"
    | "MISSING_OR_PARTIAL_RECEIPT"
    | "PRICE_VARIANCE_EXCEEDS_TOLERANCE"
    | "QUANTITY_OVERBILLED_MULTI_INVOICE"
    | "UNSUPPORTED_PO_BALANCE_OR_CANCELED_LINE"
    | "AMBIGUOUS_EVIDENCE_REVIEW_REQUIRED";
  lineComparisons: LineDeterministicComparison[];
  sourceStateHash: string;
}

export interface PromptInjectionScanResult {
  scannedFields: string[];
  untrustedInputDetected: boolean;
  severity: "none" | "high_blocked";
  detectedPatterns: string[];
  blockedDirectives: string[];
  sanitizedNote: string;
}

export type AdkSpecialistId =
  | "investigator_agent"
  | "policy_analyst_agent"
  | "resolution_planner_agent"
  | "communication_agent";

export interface AdkToolCallTrace {
  toolName:
    | "get_invoice"
    | "get_purchase_order"
    | "get_receipts"
    | "get_approved_policy"
    | "resolve_business_owner"
    | "propose_case_action";
  argumentsJson: string;
  resultSummary: string;
  authoritativeRecordIds: string[];
  durationMs: number;
}

export interface AdkAgentStepTrace {
  agentId: AdkSpecialistId;
  agentTitle: string;
  responsibility: string;
  hardLimit: string;
  status: "completed" | "blocked_by_guardrail" | "suspended_outage";
  epistemicTag: EpistemicTag;
  toolCalls: AdkToolCallTrace[];
  structuredOutput: string;
  citations: string[];
  uncertaintyNotes: string[];
}

export interface ClaimItem {
  id: string;
  statement: string;
  epistemicTag: EpistemicTag;
  citations: string[];
}

export interface CommunicationDraft {
  templateId: string;
  templateName: string;
  channel: "Internal Collaboration / Email" | "AP Triage Queue Ticket";
  recipientHandle: string;
  recipientName: string;
  recipientRole: string;
  isInternalApprovedRecipient: boolean;
  subject: string;
  body: string;
  deliveryStatus: "Not Sent" | "Delivered" | "Awaiting Reply" | "Delivery Failed — Retry Pending";
  lastSentAt?: string;
  messageId?: string;
}

export interface ResolutionPlan {
  proposedAction: PermittedActionType;
  proposedActionLabel: string;
  ownerRecordId: string;
  ownerName: string;
  ownerHandle: string;
  ownerRole: string;
  routedToTriage: boolean;
  triageReason?: string;
  requiredApprovalRole: "AP Analyst" | "Finance Controller";
  prerequisites: string[];
  rationale: string;
  citations: string[];
}

export interface CaseApproval {
  approvalId: string;
  caseId: string;
  approvedBy: string;
  approvedRole: string;
  approvedAt: string;
  approvedAction: PermittedActionType;
  sourceStateHashAtApproval: string;
  payloadHashAtApproval: string;
  status: "Valid" | "Stale — Reapproval Required" | "Executed" | "Superseded";
}

export interface AuditTimelineEvent {
  id: string;
  timestamp: string;
  actor: string;
  actorKind: "system" | "adk_agent" | "policy_gateway" | "human";
  phase:
    | "Ingestion"
    | "Deterministic Rules"
    | "ADK Investigation"
    | "Human Review"
    | "Policy Gateway"
    | "Communication"
    | "Recheck & Closure"
    | "Security Guardrail";
  action: string;
  detail: string;
  evidenceRefs: string[];
  epistemicTag: EpistemicTag;
  stateAfter: CaseState;
  idempotencyKey?: string;
}

export interface ProcurementCase {
  caseId: string;
  dedupKey: string;
  title: string;
  category: ExceptionCategory;
  supportedInInitialRelease: boolean;
  state: CaseState;
  ageHours: number;
  department: DepartmentScope;
  currentBlocker: string;
  recommendedNextStep: string;
  humanReviewRequired: boolean;
  freshnessStatus: "Fresh" | "Stale — Source Updated" | "Source Outage";
  invoice: CoupaInvoice;
  purchaseOrder: CoupaPurchaseOrder;
  receipts: CoupaReceipt[];
  applicablePolicy: ApprovalPolicy;
  ownership: OwnershipRecord;
  comparison: DeterministicComparison;
  securityScan: PromptInjectionScanResult;
  issueExplanation: ClaimItem[];
  resolutionPlan: ResolutionPlan;
  communicationDraft: CommunicationDraft;
  adkTrace: AdkAgentStepTrace[];
  approval: CaseApproval | null;
  executedIdempotencyKeys: string[];
  closureMode?: "Authoritative Coupa Match" | "Manual Case Closure";
  closureNote?: string;
  timeline: AuditTimelineEvent[];
}

export interface GatewayExecutionResult {
  allowed: boolean;
  code:
    | "EXECUTED_OK"
    | "BLOCKED_PROHIBITED_ACTION"
    | "BLOCKED_MISSING_APPROVAL"
    | "BLOCKED_STALE_APPROVAL"
    | "BLOCKED_IDEMPOTENT_DUPLICATE"
    | "BLOCKED_RBAC_PERMISSION"
    | "BLOCKED_UNAPPROVED_RECIPIENT"
    | "BLOCKED_SOURCE_OUTAGE";
  reason: string;
  updatedCase: ProcurementCase;
}

export interface ReleaseGateTestResult {
  id: string;
  requirementId: string;
  category: "Business Correctness" | "AI Quality & Safety" | "Operational Reliability" | "Security & Governance";
  title: string;
  passed: boolean;
  assertionSummary: string;
  evidenceRef: string;
}
