import {
  existsSync,
  mkdirSync,
  readFileSync,
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

  return null;
}

export function appendAuditRecord(record: AuditLogRecord | null) {
  if (!record) {
    return;
  }

  writeAuditLog([...readAuditLog(), record]);
}

export function readAuditLog(): AuditLogRecord[] {
  if (!existsSync(AUDIT_LOG_PATH)) {
    return [];
  }

  try {
    return JSON.parse(readFileSync(AUDIT_LOG_PATH, "utf8")) as AuditLogRecord[];
  } catch {
    return [];
  }
}

function isExecutionOutcome(executionStatus: string) {
  return (
    executionStatus === "Mock swap signature returned" ||
    executionStatus === "Volume bot started" ||
    executionStatus.endsWith("... returned")
  );
}

function writeAuditLog(records: AuditLogRecord[]) {
  mkdirSync(path.dirname(AUDIT_LOG_PATH), { recursive: true });
  writeFileSync(AUDIT_LOG_PATH, JSON.stringify(records, null, 2));
}
