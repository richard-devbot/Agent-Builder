/**
 * Deterministic Financial Rules Engine, 4-Agent Google ADK Orchestration Runtime,
 * Prompt-Injection Shield, and Policy & Action Gateway for the Procurement Resolution Hub.
 *
 * Implements BR-01 through BR-12 and Sections 2–10 of the Procurement Resolution Hub specification.
 */

import type {
  AdkAgentStepTrace,
  ApprovalPolicy,
  AuditTimelineEvent,
  CaseApproval,
  ClaimItem,
  CoupaInvoice,
  CoupaPurchaseOrder,
  CoupaReceipt,
  DeterministicComparison,
  GatewayExecutionResult,
  LineDeterministicComparison,
  OwnershipRecord,
  PermittedActionType,
  PersonaProfile,
  ProcurementCase,
  ProhibitedActionType,
  PromptInjectionScanResult,
} from "./types";

export const PROHIBITED_ACTIONS_CATALOG: {
  action: ProhibitedActionType;
  label: string;
  policyRule: string;
  reason: string;
}[] = [
  {
    action: "APPROVE_INVOICE",
    label: "Approve invoice or purchase",
    policyRule: "GOV-POL-12 §2.1",
    reason: "Initial release explicitly prohibits autonomous or workbench-triggered financial invoice approval.",
  },
  {
    action: "RELEASE_PAYMENT",
    label: "Initiate or release payment",
    policyRule: "GOV-POL-12 §2.2",
    reason: "Payment disbursement requires Coupa AP batch release outside the Resolution Hub.",
  },
  {
    action: "CHANGE_SUPPLIER_BANK",
    label: "Change supplier banking / remittance details",
    policyRule: "SEC-POL-09 §4.1",
    reason: "Supplier master banking updates require out-of-band Treasury verification.",
  },
  {
    action: "MODIFY_PO_PRICE_QTY",
    label: "Modify PO prices or quantities",
    policyRule: "GOV-POL-12 §2.4",
    reason: "PO change orders must be authored and approved in Coupa by an authorized Buyer.",
  },
  {
    action: "AUTO_RECORD_RECEIPT",
    label: "Record goods receipt without authorized confirmation",
    policyRule: "FIN-POL-01 §3.3",
    reason: "Receipts can only be recorded after explicit confirmation from the receiving business owner.",
  },
  {
    action: "AI_AS_FINANCIAL_AUTH",
    label: "Treat AI recommendation as financial authorization",
    policyRule: "GOV-POL-12 §1.1",
    reason: "Autonomy is granted per action, not per agent. Model output never constitutes financial sign-off.",
  },
];

export function formatCurrencyCents(cents: number, currency: "USD" | "EUR" | "GBP" = "USD"): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents) / 100;
  const symbol = currency === "EUR" ? "€" : currency === "GBP" ? "£" : "$";
  return `${sign}${symbol}${abs.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

/**
 * Computes a deterministic state fingerprint over the authoritative Coupa Invoice, PO, and Receipts.
 * Used by BR-08 to detect stale approvals when underlying records change after human sign-off.
 */
export function computeDeterministicStateHash(
  invoice: CoupaInvoice,
  po: CoupaPurchaseOrder,
  receipts: CoupaReceipt[],
): string {
  const payload = JSON.stringify({
    invId: invoice.invoiceId,
    invVer: invoice.sourceVersion,
    invTotal: invoice.totalCents,
    invStatus: invoice.coupaStatus,
    invLines: invoice.lines.map((l) => [l.lineNumber, l.quantityInvoiced, l.unitPriceCents]),
    poId: po.poId,
    poStatus: po.poStatus,
    poLines: po.lines.map((l) => [l.poLineNumber, l.quantityOrdered, l.unitPriceCents, l.lineStatus]),
    rcpts: receipts.map((r) => [
      r.receiptId,
      r.status,
      r.lines.map((rl) => [rl.poLineNumber, rl.quantityReceived]),
    ]),
  });
  let hash = 2166136261;
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `coupa-sha-${(hash >>> 0).toString(16).padStart(8, "0")}-v${invoice.sourceVersion}`;
}

/**
 * BR-03: Deterministic financial comparison across invoice lines, PO lines,
 * partial receipts, and multiple prior invoices against the same PO.
 */
export function computeDeterministicComparison(
  invoice: CoupaInvoice,
  po: CoupaPurchaseOrder,
  receipts: CoupaReceipt[],
  policy: ApprovalPolicy,
): DeterministicComparison {
  const lineComparisons: LineDeterministicComparison[] = [];
  let totalPriceVarianceCents = 0;
  let totalUnreceivedValueCents = 0;
  let hasPartialReceipt = false;
  let hasCanceledLine = false;
  let anyOverBilledQty = false;
  let allLinesWithinPriceTolerance = true;
  let allLinesWithinRoundingTolerance = true;

  for (const invLine of invoice.lines) {
    const poLine = po.lines.find((pl) => pl.poLineNumber === invLine.poLineNumber);
    const orderedQty = poLine?.quantityOrdered ?? 0;
    const poUnitPriceCents = poLine?.unitPriceCents ?? invLine.unitPriceCents;
    const poLineStatus = poLine?.lineStatus ?? "Open";
    if (poLineStatus === "Canceled") hasCanceledLine = true;

    const priorInvoicedQty = po.priorInvoices
      .filter((pi) => pi.poLineNumber === invLine.poLineNumber)
      .reduce((acc, pi) => acc + pi.quantityBilled, 0);

    const receivedQty = receipts
      .flatMap((r) => r.lines)
      .filter((rl) => rl.poLineNumber === invLine.poLineNumber)
      .reduce((acc, rl) => acc + rl.quantityReceived, 0);

    const cumulativeInvoicedQty = priorInvoicedQty + invLine.quantityInvoiced;
    const unreceivedInvoicedQty = Math.max(0, cumulativeInvoicedQty - receivedQty);
    const overBilledAgainstPoQty = Math.max(0, cumulativeInvoicedQty - orderedQty);
    if (overBilledAgainstPoQty > 0) anyOverBilledQty = true;

    const unitPriceDeltaCents = invLine.unitPriceCents - poUnitPriceCents;
    const unitPriceDeltaPct =
      poUnitPriceCents > 0
        ? Number(((Math.abs(unitPriceDeltaCents) / poUnitPriceCents) * 100).toFixed(4))
        : 0;
    const lineSubtotalDeltaCents = unitPriceDeltaCents * invLine.quantityInvoiced;

    totalPriceVarianceCents += lineSubtotalDeltaCents;
    totalUnreceivedValueCents += unreceivedInvoicedQty * invLine.unitPriceCents;

    const withinRoundingTolerance =
      Math.abs(lineSubtotalDeltaCents) <= policy.roundingToleranceCents;
    const withinPriceTolerance =
      withinRoundingTolerance ||
      (unitPriceDeltaPct <= policy.maxUnitPriceVariancePct &&
        Math.abs(lineSubtotalDeltaCents) <= policy.maxAbsoluteVarianceCents);

    if (!withinPriceTolerance) allLinesWithinPriceTolerance = false;
    if (!withinRoundingTolerance) allLinesWithinRoundingTolerance = false;

    let receiptMatchStatus: LineDeterministicComparison["receiptMatchStatus"] = "FULL_RECEIPT";
    if (receivedQty === 0) {
      receiptMatchStatus = "NO_RECEIPT";
    } else if (receivedQty < cumulativeInvoicedQty) {
      receiptMatchStatus = "PARTIAL_RECEIPT";
      hasPartialReceipt = true;
    }

    const findings: string[] = [];
    if (poLineStatus === "Canceled") {
      findings.push(`PO Line ${invLine.poLineNumber} is CANCELED in Coupa.`);
    }
    if (overBilledAgainstPoQty > 0) {
      findings.push(
        `Cumulative billed (${cumulativeInvoicedQty} ${invLine.unitOfMeasure}) exceeds PO ordered (${orderedQty} ${invLine.unitOfMeasure}) by ${overBilledAgainstPoQty} ${invLine.unitOfMeasure} across ${po.priorInvoices.length + 1} invoices.`,
      );
    }
    if (unreceivedInvoicedQty > 0) {
      findings.push(
        `Missing receipt for ${unreceivedInvoicedQty} of ${invLine.quantityInvoiced} ${invLine.unitOfMeasure} (${formatCurrencyCents(unreceivedInvoicedQty * invLine.unitPriceCents, invoice.currency)} unreceived).`,
      );
    }
    if (unitPriceDeltaCents !== 0) {
      findings.push(
        `Unit price delta ${formatCurrencyCents(unitPriceDeltaCents, invoice.currency)} (${unitPriceDeltaPct.toFixed(2)}%) — ${withinPriceTolerance ? "WITHIN" : "EXCEEDS"} policy ${policy.policyId}.`,
      );
    }
    if (findings.length === 0) {
      findings.push("3-way match verified (PO = Receipt = Invoice).");
    }

    lineComparisons.push({
      lineNumber: invLine.lineNumber,
      poLineNumber: invLine.poLineNumber,
      itemCode: invLine.itemCode,
      description: invLine.description,
      poLineStatus,
      orderedQty,
      priorInvoicedQty,
      currentInvoicedQty: invLine.quantityInvoiced,
      cumulativeInvoicedQty,
      receivedQty,
      unreceivedInvoicedQty,
      overBilledAgainstPoQty,
      poUnitPriceCents,
      invoiceUnitPriceCents: invLine.unitPriceCents,
      unitPriceDeltaCents,
      unitPriceDeltaPct,
      lineSubtotalDeltaCents,
      withinPriceTolerance,
      withinRoundingTolerance,
      receiptMatchStatus,
      lineFinding: findings.join(" "),
    });
  }

  // Also classify multi-line partial receipt when one line is received and another line has 0 receipts
  const someReceived = lineComparisons.some((l) => l.receivedQty > 0);
  const someMissing = lineComparisons.some((l) => l.unreceivedInvoicedQty > 0);
  if (someReceived && someMissing) {
    hasPartialReceipt = true;
  }

  const remainingPoBalanceBeforeInvoiceCents =
    po.totalAuthorizedCents - po.totalConsumedPriorCents;
  const remainingPoBalanceAfterInvoiceCents =
    remainingPoBalanceBeforeInvoiceCents - invoice.subtotalCents;

  const poSubtotalBase = Math.max(1, invoice.subtotalCents - totalPriceVarianceCents);
  const totalPriceVariancePct = Number(
    ((Math.abs(totalPriceVarianceCents) / poSubtotalBase) * 100).toFixed(4),
  );

  let deterministicVerdict: DeterministicComparison["deterministicVerdict"] =
    "WITHIN_TOLERANCE";

  if (hasCanceledLine || remainingPoBalanceAfterInvoiceCents < -policy.maxAbsoluteVarianceCents && !anyOverBilledQty && Math.abs(totalPriceVarianceCents) === 0) {
    deterministicVerdict = "UNSUPPORTED_PO_BALANCE_OR_CANCELED_LINE";
  } else if (anyOverBilledQty) {
    deterministicVerdict = "QUANTITY_OVERBILLED_MULTI_INVOICE";
  } else if (!allLinesWithinPriceTolerance) {
    deterministicVerdict = "PRICE_VARIANCE_EXCEEDS_TOLERANCE";
  } else if (totalUnreceivedValueCents > 0) {
    deterministicVerdict = "MISSING_OR_PARTIAL_RECEIPT";
  }

  return {
    currency: invoice.currency,
    poTotalAuthorizedCents: po.totalAuthorizedCents,
    priorInvoicesTotalCents: po.totalConsumedPriorCents,
    currentInvoiceSubtotalCents: invoice.subtotalCents,
    currentInvoiceTaxCents: invoice.taxCents,
    currentInvoiceFreightCents: invoice.freightCents,
    currentInvoiceTotalCents: invoice.totalCents,
    remainingPoBalanceBeforeInvoiceCents,
    remainingPoBalanceAfterInvoiceCents,
    totalPriceVarianceCents,
    totalPriceVariancePct,
    totalUnreceivedValueCents,
    hasPartialReceipt,
    hasMultipleInvoiceLines: invoice.lines.length > 1,
    hasMultipleInvoicesAgainstPo: po.priorInvoices.length > 0,
    withinPolicyTolerance: allLinesWithinPriceTolerance && totalUnreceivedValueCents === 0 && !anyOverBilledQty && !hasCanceledLine,
    withinCurrencyRounding: allLinesWithinRoundingTolerance && totalPriceVarianceCents !== 0,
    appliedPolicyId: policy.policyId,
    appliedPolicyVersion: policy.version,
    deterministicVerdict,
    lineComparisons,
    sourceStateHash: computeDeterministicStateHash(invoice, po, receipts),
  };
}

/**
 * Section 8 — Prompt-injection defense on untrusted supplier documents, invoice descriptions, and memos.
 */
export function inspectUntrustedSupplierContent(invoice: CoupaInvoice): PromptInjectionScanResult {
  const fields = [
    invoice.supplierMemo ?? "",
    ...invoice.lines.map((l) => l.description),
  ];
  const combined = fields.join(" \n ");

  const patterns: { regex: RegExp; label: string; directive: string }[] = [
    {
      regex: /\b(system\s+instruction|system\s+override|ignore\s+(?:all\s+)?(?:previous|prior|missing)|bypass\s+rule)\b/i,
      label: "System instruction override attempt",
      directive: "Attempted to override system/policy instructions from untrusted supplier memo",
    },
    {
      regex: /\b(approve\s+invoice|release\s+payment|pay\s+immediately|authorize\s+payment)\b/i,
      label: "Unauthorized financial approval directive",
      directive: "Attempted to trigger prohibited action: APPROVE_INVOICE / RELEASE_PAYMENT",
    },
    {
      regex: /\b(iban|swift|routing\s+number|remittance\s+account|new\s+bank)\b/i,
      label: "Supplier banking / IBAN modification directive",
      directive: "Attempted to trigger prohibited action: CHANGE_SUPPLIER_BANK",
    },
    {
      regex: /\b(external-vendor|external\s+recipient|send\s+confirmation\s+to|redirect\s+to)\b/i,
      label: "Arbitrary recipient redirection attempt",
      directive: "Attempted to redirect internal notification to an unapproved external recipient",
    },
  ];

  const detectedPatterns: string[] = [];
  const blockedDirectives: string[] = [];

  for (const p of patterns) {
    if (p.regex.test(combined)) {
      detectedPatterns.push(p.label);
      blockedDirectives.push(p.directive);
    }
  }

  const untrustedInputDetected = detectedPatterns.length > 0;
  return {
    scannedFields: ["invoice.supplierMemo", "invoice.lines[*].description"],
    untrustedInputDetected,
    severity: untrustedInputDetected ? "high_blocked" : "none",
    detectedPatterns,
    blockedDirectives,
    sanitizedNote: untrustedInputDetected
      ? "[UNTRUSTED SUPPLIER TEXT QUARANTINED BY before_model_guardrail — DIRECTIVES STRIPPED]"
      : (invoice.supplierMemo ?? "No untrusted directives detected."),
  };
}

/**
 * Section 6 — Runs the 4-Agent Google ADK Investigation Pipeline:
 * 1. Investigator Agent
 * 2. Policy Analyst Agent
 * 3. Resolution Planner Agent
 * 4. Communication Agent
 */
export function runAdkInvestigationPipeline(
  caseRecord: ProcurementCase,
  options?: { coupaOutage?: boolean; customAnalystPrompt?: string },
): ProcurementCase {
  const nowIso = new Date().toISOString();

  if (options?.coupaOutage) {
    const outageEvent: AuditTimelineEvent = {
      id: `evt-${Date.now()}-outage`,
      timestamp: nowIso,
      actor: "Coupa Integration Layer",
      actorKind: "system",
      phase: "ADK Investigation",
      action: "Investigation Suspended — Source System Outage",
      detail:
        "Coupa REST connector returned HTTP 503 Service Unavailable. Investigation and action execution are suspended per Section 7 safeguards; no uncertain action was taken.",
      evidenceRefs: [caseRecord.invoice.invoiceId, caseRecord.purchaseOrder.poId],
      epistemicTag: "unresolved_uncertainty",
      stateAfter: caseRecord.state,
    };
    return {
      ...caseRecord,
      freshnessStatus: "Source Outage",
      timeline: [outageEvent, ...caseRecord.timeline],
    };
  }

  const comparison = computeDeterministicComparison(
    caseRecord.invoice,
    caseRecord.purchaseOrder,
    caseRecord.receipts,
    caseRecord.applicablePolicy,
  );
  const securityScan = inspectUntrustedSupplierContent(caseRecord.invoice);

  const trace: AdkAgentStepTrace[] = [
    {
      agentId: "investigator_agent",
      agentTitle: "Investigator Agent",
      responsibility: "Assemble an evidence-backed explanation from Coupa records",
      hardLimit: "Read-only: Cannot alter source records",
      status: "completed",
      epistemicTag: "verified_fact",
      toolCalls: [
        {
          toolName: "get_invoice",
          argumentsJson: JSON.stringify({ invoice_id: caseRecord.invoice.invoiceId }),
          resultSummary: `Fetched ${caseRecord.invoice.invoiceId} (${formatCurrencyCents(caseRecord.invoice.totalCents, caseRecord.invoice.currency)}, status: ${caseRecord.invoice.coupaStatus})`,
          authoritativeRecordIds: [caseRecord.invoice.invoiceId],
          durationMs: 140,
        },
        {
          toolName: "get_purchase_order",
          argumentsJson: JSON.stringify({ po_id: caseRecord.purchaseOrder.poId }),
          resultSummary: `Fetched ${caseRecord.purchaseOrder.poId} (${caseRecord.purchaseOrder.lines.length} lines, ${caseRecord.purchaseOrder.priorInvoices.length} prior invoices)`,
          authoritativeRecordIds: [caseRecord.purchaseOrder.poId],
          durationMs: 165,
        },
        {
          toolName: "get_receipts",
          argumentsJson: JSON.stringify({ po_id: caseRecord.purchaseOrder.poId }),
          resultSummary:
            caseRecord.receipts.length > 0
              ? `Retrieved ${caseRecord.receipts.map((r) => r.receiptId).join(", ")} against ${caseRecord.purchaseOrder.poId}`
              : `0 confirmed goods receipts found for ${caseRecord.purchaseOrder.poId}`,
          authoritativeRecordIds:
            caseRecord.receipts.length > 0
              ? caseRecord.receipts.map((r) => r.receiptId)
              : [caseRecord.purchaseOrder.poId],
          durationMs: 120,
        },
      ],
      structuredOutput: `Deterministic verdict: ${comparison.deterministicVerdict}. State hash: ${comparison.sourceStateHash}. ${comparison.lineComparisons.map((l) => `Line ${l.lineNumber}: ${l.lineFinding}`).join(" | ")}`,
      citations: [
        caseRecord.invoice.invoiceId,
        caseRecord.purchaseOrder.poId,
        ...caseRecord.receipts.map((r) => r.receiptId),
      ],
      uncertaintyNotes:
        comparison.totalUnreceivedValueCents > 0
          ? ["Physical delivery status at receiving dock requires human owner confirmation."]
          : [],
    },
    {
      agentId: "policy_analyst_agent",
      agentTitle: "Policy Analyst Agent",
      responsibility: "Retrieve and interpret applicable procurement policy and tolerances",
      hardLimit: "Cannot invent policy or authorize exceptions",
      status: securityScan.untrustedInputDetected ? "blocked_by_guardrail" : "completed",
      epistemicTag: "ai_interpretation",
      toolCalls: [
        {
          toolName: "get_approved_policy",
          argumentsJson: JSON.stringify({
            topic: caseRecord.applicablePolicy.topic,
            effective_date: caseRecord.invoice.issueDate,
          }),
          resultSummary: `Loaded ${caseRecord.applicablePolicy.policyId} (${caseRecord.applicablePolicy.version}, eff. ${caseRecord.applicablePolicy.effectiveDate})`,
          authoritativeRecordIds: [caseRecord.applicablePolicy.policyId],
          durationMs: 110,
        },
      ],
      structuredOutput: securityScan.untrustedInputDetected
        ? `Quarantined untrusted supplier directives (${securityScan.detectedPatterns.join(", ")}) under SEC-POL-09. Evaluated underlying exception strictly against ${caseRecord.applicablePolicy.policyId}.`
        : `Applied ${caseRecord.applicablePolicy.policyId} (${caseRecord.applicablePolicy.version}): tolerance check=${comparison.withinPolicyTolerance ? "PASS" : "FAIL"}.`,
      citations: [caseRecord.applicablePolicy.policyId, "GOV-POL-12"],
      uncertaintyNotes: !caseRecord.supportedInInitialRelease
        ? ["Exception category is outside Initial Release autonomous scope; human escalation required."]
        : [],
    },
    {
      agentId: "resolution_planner_agent",
      agentTitle: "Resolution Planner Agent",
      responsibility: "Resolve owner from approved directory and propose permitted next step",
      hardLimit: "Cannot execute actions directly",
      status: "completed",
      epistemicTag: "ai_interpretation",
      toolCalls: [
        {
          toolName: "resolve_business_owner",
          argumentsJson: JSON.stringify({ record_id: caseRecord.ownership.recordId }),
          resultSummary:
            caseRecord.ownership.directoryStatus === "Active"
              ? `Resolved ${caseRecord.ownership.ownerName} (${caseRecord.ownership.ownerHandle}) for Cost Center ${caseRecord.ownership.costCenter}`
              : `Ownership conflict detected (${caseRecord.ownership.directoryStatus}) — routed to ${caseRecord.ownership.routingQueue}`,
          authoritativeRecordIds: [caseRecord.ownership.recordId],
          durationMs: 95,
        },
        {
          toolName: "propose_case_action",
          argumentsJson: JSON.stringify({
            case_id: caseRecord.caseId,
            action: caseRecord.resolutionPlan.proposedAction,
          }),
          resultSummary: `Proposed permitted action ${caseRecord.resolutionPlan.proposedAction} requiring ${caseRecord.resolutionPlan.requiredApprovalRole} sign-off`,
          authoritativeRecordIds: [caseRecord.caseId, caseRecord.applicablePolicy.policyId],
          durationMs: 105,
        },
      ],
      structuredOutput: `Proposed action: ${caseRecord.resolutionPlan.proposedActionLabel} -> Owner: ${caseRecord.resolutionPlan.ownerName} (${caseRecord.resolutionPlan.ownerHandle}).`,
      citations: [
        caseRecord.ownership.recordId,
        caseRecord.applicablePolicy.policyId,
        caseRecord.invoice.invoiceId,
      ],
      uncertaintyNotes:
        caseRecord.ownership.directoryStatus !== "Active"
          ? [caseRecord.ownership.conflictDetail ?? "Business owner directory mapping is unresolved."]
          : [],
    },
    {
      agentId: "communication_agent",
      agentTitle: "Communication Agent",
      responsibility: "Draft structured internal follow-up message from approved template",
      hardLimit: "Cannot send messages directly; Policy Gateway verifies approval & recipient",
      status: "completed",
      epistemicTag: "ai_interpretation",
      toolCalls: [],
      structuredOutput: `Prepared template ${caseRecord.communicationDraft.templateId} for internal recipient ${caseRecord.communicationDraft.recipientHandle}. Held for human review.`,
      citations: [
        caseRecord.communicationDraft.templateId,
        caseRecord.invoice.invoiceId,
        caseRecord.purchaseOrder.poId,
      ],
      uncertaintyNotes: [],
    },
  ];

  const nextState = !caseRecord.supportedInInitialRelease
    ? "Unsupported / escalated"
    : caseRecord.ownership.directoryStatus !== "Active"
      ? "Needs more information"
      : "Ready for review";

  const adkEvent: AuditTimelineEvent = {
    id: `evt-${Date.now()}-adk`,
    timestamp: nowIso,
    actor: "Google ADK Runtime (4-Agent Pipeline)",
    actorKind: "adk_agent",
    phase: "ADK Investigation",
    action: "Completed 4-Agent Evidence & Policy Synthesis",
    detail: `Investigator, Policy Analyst, Resolution Planner, and Communication Agent verified ${caseRecord.invoice.invoiceId} against ${caseRecord.purchaseOrder.poId} (hash: ${comparison.sourceStateHash}).${options?.customAnalystPrompt ? ` Analyst query addressed: "${options.customAnalystPrompt}".` : ""}`,
    evidenceRefs: [
      caseRecord.invoice.invoiceId,
      caseRecord.purchaseOrder.poId,
      caseRecord.applicablePolicy.policyId,
      caseRecord.ownership.recordId,
    ],
    epistemicTag: "ai_interpretation",
    stateAfter: nextState,
  };

  return {
    ...caseRecord,
    state: nextState,
    freshnessStatus: "Fresh",
    comparison,
    securityScan,
    adkTrace: trace,
    timeline: [adkEvent, ...caseRecord.timeline],
  };
}

/**
 * BR-07: Human approval recorded outside the language model.
 */
export function approveCaseAction(
  caseRecord: ProcurementCase,
  persona: PersonaProfile,
): { ok: boolean; error?: string; updatedCase: ProcurementCase } {
  if (!persona.allowedDepartments.includes(caseRecord.department)) {
    return {
      ok: false,
      error: `RBAC Policy (BR-11): Persona "${persona.name}" is not authorized for ${caseRecord.department} cases.`,
      updatedCase: caseRecord,
    };
  }
  if (!persona.canApproveStandard) {
    return {
      ok: false,
      error: `RBAC Policy (BR-11): Persona "${persona.name}" has read-only access (${persona.readOnlyReason ?? "cannot approve actions"}).`,
      updatedCase: caseRecord,
    };
  }
  if (
    caseRecord.resolutionPlan.requiredApprovalRole === "Finance Controller" &&
    !persona.canApproveHighValue
  ) {
    return {
      ok: false,
      error: `Separation of Duties (BR-07): Action "${caseRecord.resolutionPlan.proposedActionLabel}" requires Finance Controller approval. Switch persona to Finance Controller.`,
      updatedCase: caseRecord,
    };
  }

  const currentHash = computeDeterministicStateHash(
    caseRecord.invoice,
    caseRecord.purchaseOrder,
    caseRecord.receipts,
  );
  const payloadHash = `payload-${caseRecord.resolutionPlan.proposedAction}-${caseRecord.communicationDraft.recipientHandle}`;
  const approvalId = `APPR-${caseRecord.caseId.split("-").pop()}-${Date.now().toString().slice(-4)}`;
  const nowIso = new Date().toISOString();

  const approval: CaseApproval = {
    approvalId,
    caseId: caseRecord.caseId,
    approvedBy: `${persona.name} (${persona.actorHandle})`,
    approvedRole: persona.roleTitle,
    approvedAt: nowIso,
    approvedAction: caseRecord.resolutionPlan.proposedAction,
    sourceStateHashAtApproval: currentHash,
    payloadHashAtApproval: payloadHash,
    status: "Valid",
  };

  const event: AuditTimelineEvent = {
    id: `evt-${Date.now()}-appr`,
    timestamp: nowIso,
    actor: `${persona.name} (${persona.actorHandle})`,
    actorKind: "human",
    phase: "Human Review",
    action: `Approved Action (${approvalId})`,
    detail: `Human approver verified evidence package and approved "${caseRecord.resolutionPlan.proposedActionLabel}" bound to state hash ${currentHash}.`,
    evidenceRefs: [approvalId, caseRecord.invoice.invoiceId, caseRecord.applicablePolicy.policyId],
    epistemicTag: "verified_fact",
    stateAfter: "Approved action",
  };

  return {
    ok: true,
    updatedCase: {
      ...caseRecord,
      state: "Approved action",
      humanReviewRequired: false,
      freshnessStatus: "Fresh",
      approval,
      timeline: [event, ...caseRecord.timeline],
    },
  };
}

/**
 * Simulates an upstream Coupa PO or Receipt change AFTER human approval
 * to demonstrate BR-08 (stale approval detection & revalidation gate).
 */
export function simulateCoupaSourceMutationAfterApproval(
  caseRecord: ProcurementCase,
): ProcurementCase {
  const nextVersion = caseRecord.invoice.sourceVersion + 1;
  const mutatedInvoice: CoupaInvoice = {
    ...caseRecord.invoice,
    sourceVersion: nextVersion,
    lastSyncedAt: "Just now (Coupa webhook update)",
  };
  const nextComparison = computeDeterministicComparison(
    mutatedInvoice,
    caseRecord.purchaseOrder,
    caseRecord.receipts,
    caseRecord.applicablePolicy,
  );
  const updatedApproval: CaseApproval | null = caseRecord.approval
    ? {
        ...caseRecord.approval,
        status: "Stale — Reapproval Required",
      }
    : null;

  const event: AuditTimelineEvent = {
    id: `evt-${Date.now()}-stale`,
    timestamp: new Date().toISOString(),
    actor: "Coupa Event Stream",
    actorKind: "system",
    phase: "Ingestion",
    action: "Source Record Updated in Coupa (State Hash Changed)",
    detail: `Coupa record ${caseRecord.invoice.invoiceId} / ${caseRecord.purchaseOrder.poId} updated to v${nextVersion} (new hash: ${nextComparison.sourceStateHash}). Existing approval ${caseRecord.approval?.approvalId ?? "N/A"} marked STALE per BR-08.`,
    evidenceRefs: [caseRecord.invoice.invoiceId, caseRecord.purchaseOrder.poId],
    epistemicTag: "verified_fact",
    stateAfter: "Ready for review",
  };

  return {
    ...caseRecord,
    state: "Ready for review",
    humanReviewRequired: true,
    freshnessStatus: "Stale — Source Updated",
    invoice: mutatedInvoice,
    comparison: nextComparison,
    approval: updatedApproval,
    timeline: [event, ...caseRecord.timeline],
  };
}

/**
 * Section 6 & 7 — Policy and Action Gateway:
 * execute_approved_action(case_id, approval_id, idempotency_key)
 *
 * The service—not the model—verifies:
 * 1. Prohibited action hard-block (Section 2)
 * 2. Source availability (Section 7)
 * 3. Authenticated RBAC permissions (BR-11)
 * 4. Valid human approval outside the LLM (BR-07)
 * 5. Idempotency key deduplication (Section 7)
 * 6. Source-state freshness revalidation (BR-08)
 * 7. Communication template & internal recipient policy (BR-09)
 */
export function executeApprovedAction(
  caseRecord: ProcurementCase,
  approvalId: string,
  idempotencyKey: string,
  persona: PersonaProfile,
  options?: {
    attemptedProhibitedAction?: ProhibitedActionType;
    coupaOutage?: boolean;
  },
): GatewayExecutionResult {
  const nowIso = new Date().toISOString();

  // 1. Hard block on explicitly prohibited actions (Section 2)
  if (options?.attemptedProhibitedAction) {
    const prohibited = PROHIBITED_ACTIONS_CATALOG.find(
      (p) => p.action === options.attemptedProhibitedAction,
    );
    const reason = prohibited
      ? `Hard Guardrail Block (${prohibited.policyRule}): "${prohibited.label}" is explicitly prohibited. ${prohibited.reason}`
      : "Hard Guardrail Block: Attempted action is prohibited in the initial release.";
    const blockEvent: AuditTimelineEvent = {
      id: `evt-${Date.now()}-prohibited`,
      timestamp: nowIso,
      actor: "Policy & Action Gateway",
      actorKind: "policy_gateway",
      phase: "Security Guardrail",
      action: `BLOCKED Prohibited Action: ${options.attemptedProhibitedAction}`,
      detail: reason,
      evidenceRefs: [prohibited?.policyRule ?? "GOV-POL-12", caseRecord.caseId],
      epistemicTag: "verified_fact",
      stateAfter: caseRecord.state,
      idempotencyKey,
    };
    return {
      allowed: false,
      code: "BLOCKED_PROHIBITED_ACTION",
      reason,
      updatedCase: {
        ...caseRecord,
        timeline: [blockEvent, ...caseRecord.timeline],
      },
    };
  }

  // 2. Source outage check (Section 7)
  if (options?.coupaOutage || caseRecord.freshnessStatus === "Source Outage") {
    const reason =
      "Execution suspended (Section 7): Coupa source system is unreachable. Gateway cannot revalidate current state freshness.";
    const outageEvent: AuditTimelineEvent = {
      id: `evt-${Date.now()}-gw-outage`,
      timestamp: nowIso,
      actor: "Policy & Action Gateway",
      actorKind: "policy_gateway",
      phase: "Policy Gateway",
      action: "Execution Suspended — Coupa Outage",
      detail: reason,
      evidenceRefs: [caseRecord.invoice.invoiceId],
      epistemicTag: "unresolved_uncertainty",
      stateAfter: caseRecord.state,
      idempotencyKey,
    };
    return {
      allowed: false,
      code: "BLOCKED_SOURCE_OUTAGE",
      reason,
      updatedCase: {
        ...caseRecord,
        timeline: [outageEvent, ...caseRecord.timeline],
      },
    };
  }

  // 3. RBAC check (BR-11)
  if (
    !persona.canExecuteGateway ||
    !persona.allowedDepartments.includes(caseRecord.department)
  ) {
    const reason = `RBAC Denial (BR-11): Persona "${persona.name}" is not permitted to execute actions for ${caseRecord.department}.`;
    const rbacEvent: AuditTimelineEvent = {
      id: `evt-${Date.now()}-gw-rbac`,
      timestamp: nowIso,
      actor: "Policy & Action Gateway",
      actorKind: "policy_gateway",
      phase: "Security Guardrail",
      action: "BLOCKED Unauthorized Persona Execution",
      detail: reason,
      evidenceRefs: ["BR-11", caseRecord.caseId],
      epistemicTag: "verified_fact",
      stateAfter: caseRecord.state,
      idempotencyKey,
    };
    return {
      allowed: false,
      code: "BLOCKED_RBAC_PERMISSION",
      reason,
      updatedCase: {
        ...caseRecord,
        timeline: [rbacEvent, ...caseRecord.timeline],
      },
    };
  }

  // 4. Human approval verification outside the LLM (BR-07)
  if (!caseRecord.approval || caseRecord.approval.approvalId !== approvalId) {
    const reason =
      "Approval Gate Denial (BR-07): No matching human approval token found outside the language model.";
    const apprEvent: AuditTimelineEvent = {
      id: `evt-${Date.now()}-gw-noappr`,
      timestamp: nowIso,
      actor: "Policy & Action Gateway",
      actorKind: "policy_gateway",
      phase: "Policy Gateway",
      action: "BLOCKED Unapproved Execution Attempt",
      detail: reason,
      evidenceRefs: ["BR-07", caseRecord.caseId],
      epistemicTag: "verified_fact",
      stateAfter: caseRecord.state,
      idempotencyKey,
    };
    return {
      allowed: false,
      code: "BLOCKED_MISSING_APPROVAL",
      reason,
      updatedCase: {
        ...caseRecord,
        timeline: [apprEvent, ...caseRecord.timeline],
      },
    };
  }

  // 5. Idempotency check (Section 7)
  if (caseRecord.executedIdempotencyKeys.includes(idempotencyKey)) {
    const reason = `Idempotency Guard (Section 7): Idempotency key "${idempotencyKey}" was already executed. Duplicate action suppressed.`;
    const idemEvent: AuditTimelineEvent = {
      id: `evt-${Date.now()}-gw-idem`,
      timestamp: nowIso,
      actor: "Policy & Action Gateway",
      actorKind: "policy_gateway",
      phase: "Policy Gateway",
      action: "Suppressed Duplicate Execution (Idempotency Key Match)",
      detail: reason,
      evidenceRefs: [idempotencyKey, approvalId],
      epistemicTag: "verified_fact",
      stateAfter: caseRecord.state,
      idempotencyKey,
    };
    return {
      allowed: false,
      code: "BLOCKED_IDEMPOTENT_DUPLICATE",
      reason,
      updatedCase: {
        ...caseRecord,
        timeline: [idemEvent, ...caseRecord.timeline],
      },
    };
  }

  // 6. Stale-state revalidation (BR-08)
  const liveHash = computeDeterministicStateHash(
    caseRecord.invoice,
    caseRecord.purchaseOrder,
    caseRecord.receipts,
  );
  if (
    caseRecord.approval.status === "Stale — Reapproval Required" ||
    caseRecord.approval.sourceStateHashAtApproval !== liveHash
  ) {
    const reason = `Stale Approval Blocked (BR-08): Approval ${approvalId} was signed against state ${caseRecord.approval.sourceStateHashAtApproval}, but current Coupa state is ${liveHash}. Re-approval required.`;
    const staleEvent: AuditTimelineEvent = {
      id: `evt-${Date.now()}-gw-stale`,
      timestamp: nowIso,
      actor: "Policy & Action Gateway",
      actorKind: "policy_gateway",
      phase: "Policy Gateway",
      action: "BLOCKED Stale Approval — Source Data Changed",
      detail: reason,
      evidenceRefs: ["BR-08", approvalId, caseRecord.invoice.invoiceId],
      epistemicTag: "verified_fact",
      stateAfter: "Ready for review",
      idempotencyKey,
    };
    return {
      allowed: false,
      code: "BLOCKED_STALE_APPROVAL",
      reason,
      updatedCase: {
        ...caseRecord,
        state: "Ready for review",
        humanReviewRequired: true,
        freshnessStatus: "Stale — Source Updated",
        approval: {
          ...caseRecord.approval,
          status: "Stale — Reapproval Required",
        },
        timeline: [staleEvent, ...caseRecord.timeline],
      },
    };
  }

  // 7. Communication recipient & channel policy check (BR-09)
  const recipientHandle = caseRecord.communicationDraft.recipientHandle.trim();
  const isApprovedInternal =
    caseRecord.communicationDraft.isInternalApprovedRecipient &&
    recipientHandle.startsWith("internal:") &&
    !/external|supplier|vendor|attacker/i.test(recipientHandle);

  if (!isApprovedInternal) {
    const reason = `Communication Policy Denial (BR-09): Recipient "${recipientHandle}" is not an approved internal business owner handle. Supplier-facing or external redirection is blocked in the initial release.`;
    const commBlockEvent: AuditTimelineEvent = {
      id: `evt-${Date.now()}-gw-comm`,
      timestamp: nowIso,
      actor: "Policy & Action Gateway",
      actorKind: "policy_gateway",
      phase: "Security Guardrail",
      action: "BLOCKED Unapproved Communication Recipient",
      detail: reason,
      evidenceRefs: ["BR-09", caseRecord.communicationDraft.templateId],
      epistemicTag: "verified_fact",
      stateAfter: caseRecord.state,
      idempotencyKey,
    };
    return {
      allowed: false,
      code: "BLOCKED_UNAPPROVED_RECIPIENT",
      reason,
      updatedCase: {
        ...caseRecord,
        timeline: [commBlockEvent, ...caseRecord.timeline],
      },
    };
  }

  // All checks passed -> Execute action!
  const nextState =
    caseRecord.resolutionPlan.proposedAction === "LOG_TOLERANCE_VERIFICATION_AND_RECHECK"
      ? "Rechecking"
      : caseRecord.resolutionPlan.proposedAction === "ESCALATE_UNSUPPORTED_EXCEPTION"
        ? "Unsupported / escalated"
        : "Awaiting response";

  const msgId = `MSG-${caseRecord.caseId.split("-").pop()}-${Date.now().toString().slice(-4)}`;
  const execEvent: AuditTimelineEvent = {
    id: `evt-${Date.now()}-gw-ok`,
    timestamp: nowIso,
    actor: "Policy & Action Gateway",
    actorKind: "policy_gateway",
    phase: "Communication",
    action: `Executed Approved Action: ${caseRecord.resolutionPlan.proposedActionLabel}`,
    detail: `Verified approval ${approvalId}, state hash ${liveHash}, and idempotency key ${idempotencyKey}. Dispatched template ${caseRecord.communicationDraft.templateId} (${msgId}) to ${caseRecord.communicationDraft.recipientName} (${recipientHandle}).`,
    evidenceRefs: [
      approvalId,
      idempotencyKey,
      msgId,
      caseRecord.communicationDraft.templateId,
    ],
    epistemicTag: "verified_fact",
    stateAfter: nextState,
    idempotencyKey,
  };

  return {
    allowed: true,
    code: "EXECUTED_OK",
    reason: `Action "${caseRecord.resolutionPlan.proposedActionLabel}" executed safely via Policy & Action Gateway (${msgId}).`,
    updatedCase: {
      ...caseRecord,
      state: nextState,
      humanReviewRequired: false,
      approval: {
        ...caseRecord.approval,
        status: "Executed",
      },
      communicationDraft: {
        ...caseRecord.communicationDraft,
        deliveryStatus: "Delivered",
        lastSentAt: nowIso,
        messageId: msgId,
      },
      executedIdempotencyKeys: [...caseRecord.executedIdempotencyKeys, idempotencyKey],
      timeline: [execEvent, ...caseRecord.timeline],
    },
  };
}

/**
 * Section 7 — Follow-up reminder with delivery-status verification before resending.
 */
export function sendFollowUpReminder(
  caseRecord: ProcurementCase,
  persona: PersonaProfile,
): { ok: boolean; message: string; updatedCase: ProcurementCase } {
  const nowIso = new Date().toISOString();
  const prevStatus = caseRecord.communicationDraft.deliveryStatus;

  if (prevStatus === "Not Sent") {
    return {
      ok: false,
      message: "Initial communication has not been sent yet. Approve and execute the primary action first.",
      updatedCase: caseRecord,
    };
  }

  const reminderId = `REM-${Date.now().toString().slice(-4)}`;
  const detail =
    prevStatus === "Delivery Failed — Retry Pending"
      ? `Checked prior delivery outcome (${prevStatus}). Re-queued and delivered message ${reminderId} to ${caseRecord.communicationDraft.recipientHandle}.`
      : `Checked prior delivery outcome (${prevStatus}, message ${caseRecord.communicationDraft.messageId ?? "initial"}). Sent governed follow-up reminder ${reminderId} to ${caseRecord.communicationDraft.recipientName} (${caseRecord.communicationDraft.recipientHandle}).`;

  const event: AuditTimelineEvent = {
    id: `evt-${Date.now()}-rem`,
    timestamp: nowIso,
    actor: `${persona.name} (${persona.actorHandle})`,
    actorKind: "human",
    phase: "Communication",
    action: `Follow-Up Reminder Dispatched (${reminderId})`,
    detail,
    evidenceRefs: [reminderId, caseRecord.communicationDraft.templateId],
    epistemicTag: "verified_fact",
    stateAfter: "Awaiting response",
  };

  return {
    ok: true,
    message: detail,
    updatedCase: {
      ...caseRecord,
      state: "Awaiting response",
      communicationDraft: {
        ...caseRecord.communicationDraft,
        deliveryStatus: "Awaiting Reply",
        lastSentAt: nowIso,
      },
      timeline: [event, ...caseRecord.timeline],
    },
  };
}

/**
 * BR-10 — Case closure must depend on authoritative Coupa status,
 * or be explicitly labeled as Manual Case Closure.
 */
export function recheckAuthoritativeStatusAndClose(
  caseRecord: ProcurementCase,
  persona: PersonaProfile,
  mode: "authoritative_coupa" | "manual_closure",
  manualReason?: string,
): { ok: boolean; message: string; updatedCase: ProcurementCase } {
  const nowIso = new Date().toISOString();

  if (mode === "manual_closure") {
    if (!persona.canManualClose) {
      return {
        ok: false,
        message: `RBAC Policy (BR-10 / BR-11): Persona "${persona.name}" is not authorized to perform Manual Case Closure.`,
        updatedCase: caseRecord,
      };
    }
    const reasonText = (manualReason ?? "").trim();
    if (reasonText.length < 8) {
      return {
        ok: false,
        message: "BR-10 requires an explicit audit reason (at least 8 characters) for Manual Case Closure.",
        updatedCase: caseRecord,
      };
    }

    const manualEvent: AuditTimelineEvent = {
      id: `evt-${Date.now()}-manual-close`,
      timestamp: nowIso,
      actor: `${persona.name} (${persona.actorHandle})`,
      actorKind: "human",
      phase: "Recheck & Closure",
      action: "Closed via Explicit Manual Case Closure (BR-10)",
      detail: `Case manually closed without Coupa Ready-to-Pay transition. Labeled as "Manual Case Closure". Reason: "${reasonText}"`,
      evidenceRefs: ["BR-10", caseRecord.invoice.invoiceId],
      epistemicTag: "verified_fact",
      stateAfter: "Resolved",
    };

    return {
      ok: true,
      message: `Case ${caseRecord.caseId} closed and explicitly labeled as "Manual Case Closure".`,
      updatedCase: {
        ...caseRecord,
        state: "Resolved",
        humanReviewRequired: false,
        closureMode: "Manual Case Closure",
        closureNote: reasonText,
        timeline: [manualEvent, ...caseRecord.timeline],
      },
    };
  }

  // Authoritative Coupa Recheck Mode:
  // Simulate Coupa confirming the receipt or PO update and transitioning invoice status to "Ready to Pay"
  const updatedReceipts: CoupaReceipt[] =
    caseRecord.category === "MISSING_RECEIPT"
      ? [
          {
            receiptId: `RCV-${caseRecord.purchaseOrder.poId.split("-").pop()}-CONF`,
            poId: caseRecord.purchaseOrder.poId,
            receivedDate: nowIso.slice(0, 10),
            status: "Confirmed",
            sourceUrl: `coupa://receipts/RCV-${caseRecord.purchaseOrder.poId.split("-").pop()}-CONF`,
            lines: caseRecord.invoice.lines.map((l) => ({
              receiptId: `RCV-${caseRecord.purchaseOrder.poId.split("-").pop()}-CONF`,
              poLineNumber: l.poLineNumber,
              quantityReceived: l.quantityInvoiced,
              receivedByHandle: caseRecord.ownership.ownerHandle,
              receivedDate: nowIso.slice(0, 10),
              conditionNote: "Confirmed by receiving owner in Coupa",
            })),
          },
        ]
      : caseRecord.receipts;

  const updatedInvoice: CoupaInvoice = {
    ...caseRecord.invoice,
    coupaStatus: "Ready to Pay",
    lastSyncedAt: "Just now (Authoritative Coupa Recheck)",
    sourceVersion: caseRecord.invoice.sourceVersion + 1,
  };

  const recheckEvent: AuditTimelineEvent = {
    id: `evt-${Date.now()}-auth-close`,
    timestamp: nowIso,
    actor: "Coupa Integration Layer",
    actorKind: "system",
    phase: "Recheck & Closure",
    action: "Resolved via Authoritative Coupa Status Confirmation (BR-10)",
    detail: `Authoritative Coupa recheck confirmed ${updatedInvoice.invoiceId} status = "Ready to Pay" against ${caseRecord.purchaseOrder.poId}. Case closed automatically.`,
    evidenceRefs: [
      updatedInvoice.invoiceId,
      caseRecord.purchaseOrder.poId,
      ...updatedReceipts.map((r) => r.receiptId),
    ],
    epistemicTag: "verified_fact",
    stateAfter: "Resolved",
  };

  return {
    ok: true,
    message: `Authoritative Coupa status confirmed ("Ready to Pay"). Case ${caseRecord.caseId} resolved.`,
    updatedCase: {
      ...caseRecord,
      state: "Resolved",
      humanReviewRequired: false,
      freshnessStatus: "Fresh",
      invoice: updatedInvoice,
      receipts: updatedReceipts,
      closureMode: "Authoritative Coupa Match",
      closureNote: `Verified against Coupa status "Ready to Pay" on ${nowIso.slice(0, 10)}.`,
      timeline: [recheckEvent, ...caseRecord.timeline],
    },
  };
}

/**
 * BR-01 — Every eligible exception must become a tracked case without duplicate creation.
 */
export function ingestExceptionWithDeduplication(
  existingCases: ProcurementCase[],
  candidate: ProcurementCase,
): {
  created: boolean;
  deduplicatedCaseId: string;
  message: string;
  cases: ProcurementCase[];
} {
  const existing = existingCases.find(
    (c) =>
      c.dedupKey === candidate.dedupKey ||
      (c.invoice.invoiceId === candidate.invoice.invoiceId &&
        c.purchaseOrder.poId === candidate.purchaseOrder.poId &&
        c.category === candidate.category),
  );

  if (existing) {
    const replayEvent: AuditTimelineEvent = {
      id: `evt-${Date.now()}-dedup`,
      timestamp: new Date().toISOString(),
      actor: "Coupa Integration Layer",
      actorKind: "system",
      phase: "Ingestion",
      action: "Duplicate Event Suppressed (BR-01 Deduplication)",
      detail: `Inbound Coupa event for (${candidate.invoice.invoiceId}, ${candidate.purchaseOrder.poId}, ${candidate.category}) matched existing case ${existing.caseId} via dedupKey "${existing.dedupKey}". Attached replay timestamp without creating a duplicate case.`,
      evidenceRefs: ["BR-01", existing.caseId, candidate.invoice.invoiceId],
      epistemicTag: "verified_fact",
      stateAfter: existing.state,
    };
    const updatedExisting: ProcurementCase = {
      ...existing,
      timeline: [replayEvent, ...existing.timeline],
    };
    return {
      created: false,
      deduplicatedCaseId: existing.caseId,
      message: `BR-01 Deduplication: Event for ${candidate.invoice.invoiceId} / ${candidate.purchaseOrder.poId} matched existing case ${existing.caseId}. Duplicate case creation prevented.`,
      cases: existingCases.map((c) => (c.caseId === existing.caseId ? updatedExisting : c)),
    };
  }

  return {
    created: true,
    deduplicatedCaseId: candidate.caseId,
    message: `Created tracked case ${candidate.caseId} for ${candidate.invoice.invoiceId} (${candidate.category}).`,
    cases: [candidate, ...existingCases],
  };
}
