import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import type { MockChatResult, PendingPlan } from "@/lib/agent/mock-chat";
import type { AuditLogRecord } from "@/lib/audit-log-types";

const AUDIT_LOG_PATH = path.join(
  process.cwd(),
  ".smithii-local",
  "audit-log.json",
);
const AUDIT_LOG_LOCK_PATH = `${AUDIT_LOG_PATH}.lock`;

export function auditRecordForResult({
  result,
  sessionId,
  consumedPlan,
}: {
  result: MockChatResult;
  sessionId: string;
  consumedPlan: PendingPlan | null;
}): AuditLogRecord | null {
  if (result.pendingPlan) {
    return {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      sessionId,
      event: "preview_prepared",
      tool: result.pendingPlan.tool,
      planId: result.pendingPlan.id,
      outcome: result.executionStatus,
    };
  }

  if (consumedPlan && isExecutionOutcome(result.executionStatus)) {
    return {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      sessionId,
      event: "mock_executed",
      tool: consumedPlan.tool,
      planId: consumedPlan.id,
      outcome: result.executionStatus,
    };
  }

  if (consumedPlan && result.executionStatus === "Preview expired") {
    return {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      sessionId,
      event: "confirmation_expired",
      tool: consumedPlan.tool,
      planId: consumedPlan.id,
      outcome: result.executionStatus,
    };
  }

  return null;
}

export function auditRecordForRejectedPendingPlan({
  pendingPlan,
  sessionId,
  outcome,
}: {
  pendingPlan: unknown;
  sessionId: string;
  outcome: string;
}): AuditLogRecord {
  return {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    sessionId,
    event: "confirmation_rejected",
    ...safePendingPlanFields(pendingPlan),
    outcome,
  };
}

export function auditRecordForRejectedPrivateKey({
  sessionId,
}: {
  sessionId: string;
}): AuditLogRecord {
  return {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    sessionId,
    event: "private_key_rejected",
    outcome: "Invalid request.",
  };
}

export function appendAuditRecord(record: AuditLogRecord | null) {
  if (!record) {
    return;
  }

  if (!ensureWritableAuditLog()) {
    return;
  }
  mkdirSync(path.dirname(AUDIT_LOG_PATH), { recursive: true });
  appendFileSync(AUDIT_LOG_PATH, `${JSON.stringify(record)}\n`);
}

export function readAuditLog(): AuditLogRecord[] {
  if (!existsSync(AUDIT_LOG_PATH)) {
    return [];
  }

  return parseAuditLogFile(readFileSync(AUDIT_LOG_PATH, "utf8")) ?? [];
}

function isExecutionOutcome(executionStatus: string) {
  return (
    executionStatus === "Mock swap signature returned" ||
    executionStatus === "Volume bot started" ||
    executionStatus === "Launch + Volume sequence queued" ||
    executionStatus.endsWith("... returned")
  );
}

function ensureWritableAuditLog() {
  if (!existsSync(AUDIT_LOG_PATH)) {
    return true;
  }

  const content = readFileSync(AUDIT_LOG_PATH, "utf8");
  const records = parseAuditLogFile(content);
  if (records === null) {
    quarantineFile(AUDIT_LOG_PATH);
    return true;
  }

  if (content.trim().startsWith("[")) {
    return convertLegacyAuditLog(records);
  }

  return true;
}

function convertLegacyAuditLog(records: AuditLogRecord[]) {
  mkdirSync(path.dirname(AUDIT_LOG_LOCK_PATH), { recursive: true });

  let lockHandle: number;
  try {
    lockHandle = openSync(AUDIT_LOG_LOCK_PATH, "wx");
  } catch {
    return false;
  }

  try {
    const currentContent = readFileSync(AUDIT_LOG_PATH, "utf8");
    if (!currentContent.trim().startsWith("[")) {
      return true;
    }

    writeFileSync(
      AUDIT_LOG_PATH,
      records.map((record) => JSON.stringify(record)).join("\n") + "\n",
    );
    return true;
  } finally {
    closeSync(lockHandle);
    try {
      unlinkSync(AUDIT_LOG_LOCK_PATH);
    } catch {
    }
  }
}

function parseAuditLogFile(content: string): AuditLogRecord[] | null {
  const trimmed = content.trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      return isAuditRecordArray(parsed) ? parsed.map(sanitizeAuditRecord) : null;
    } catch {
      return null;
    }
  }

  const records: AuditLogRecord[] = [];
  for (const line of trimmed.split(/\r?\n/)) {
    try {
      const parsed = JSON.parse(line);
      if (!isAuditRecord(parsed)) {
        continue;
      }
      records.push(sanitizeAuditRecord(parsed));
    } catch {
      continue;
    }
  }

  return records;
}

function sanitizeAuditRecord(record: AuditLogRecord): AuditLogRecord {
  return {
    id: record.id,
    createdAt: record.createdAt,
    sessionId: record.sessionId,
    event: record.event,
    ...(record.tool ? { tool: record.tool } : {}),
    ...(record.planId ? { planId: record.planId } : {}),
    outcome: record.outcome,
  };
}

function safePendingPlanFields(
  pendingPlan: unknown,
): Partial<Pick<AuditLogRecord, "tool" | "planId">> {
  if (!isRecord(pendingPlan)) {
    return {};
  }

  return {
    ...(typeof pendingPlan.id === "string" ? { planId: pendingPlan.id } : {}),
    ...(isPendingPlanTool(pendingPlan.tool) ? { tool: pendingPlan.tool } : {}),
  };
}

function isAuditRecordArray(value: unknown): value is AuditLogRecord[] {
  return Array.isArray(value) && value.every(isAuditRecord);
}

function isAuditRecord(value: unknown): value is AuditLogRecord {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.sessionId === "string" &&
    isAuditEvent(value.event) &&
    (value.tool === undefined || isPendingPlanTool(value.tool)) &&
    (value.planId === undefined || typeof value.planId === "string") &&
    typeof value.outcome === "string"
  );
}

function isAuditEvent(value: unknown) {
  return (
    value === "preview_prepared" ||
    value === "mock_executed" ||
    value === "confirmation_rejected" ||
    value === "confirmation_expired" ||
    value === "private_key_rejected"
  );
}

function isPendingPlanTool(value: unknown): value is NonNullable<AuditLogRecord["tool"]> {
  return (
    value === "bundle_launch" ||
    value === "bundle_swap" ||
    value === "volume_bot" ||
    value === "launch_volume_sequence"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function quarantineFile(filePath: string) {
  try {
    renameSync(filePath, `${filePath}.corrupt-${Date.now()}`);
  } catch {
    return;
  }
}
