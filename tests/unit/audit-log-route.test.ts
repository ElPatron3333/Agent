import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GET } from "../../src/app/api/audit-log/route";
import { appendAuditRecord } from "../../src/lib/audit-log";

const AUDIT_LOG_FILE_NAME = process.env.VITEST_POOL_ID
  ? `audit-log-${process.env.VITEST_POOL_ID}.json`
  : "audit-log.json";
const AUDIT_LOG_PATH = path.join(
  process.cwd(),
  ".smithii-local",
  AUDIT_LOG_FILE_NAME,
);

describe("/api/audit-log route", () => {
  let originalAuditLog: string | null;

  beforeEach(() => {
    originalAuditLog = existsSync(AUDIT_LOG_PATH)
      ? readFileSync(AUDIT_LOG_PATH, "utf8")
      : null;
  });

  afterEach(() => {
    const originalLines = originalAuditLog
      ?.trim()
      .split(/\r?\n/)
      .filter(Boolean) ?? [];
    const originalLineSet = new Set(originalLines);
    const currentLines = existsSync(AUDIT_LOG_PATH)
      ? readFileSync(AUDIT_LOG_PATH, "utf8").trim().split(/\r?\n/).filter(Boolean)
      : [];
    const otherTestLines = currentLines.filter((line) => {
      if (originalLineSet.has(line)) {
        return false;
      }

      try {
        const record = JSON.parse(line) as { sessionId?: unknown };
        return typeof record.sessionId !== "string" ||
          !record.sessionId.startsWith("audit-");
      } catch {
        return false;
      }
    });
    const restoredLines = [...originalLines, ...otherTestLines];

    if (restoredLines.length === 0) {
      try {
        unlinkSync(AUDIT_LOG_PATH);
      } catch {
      }
      return;
    }

    mkdirSync(path.dirname(AUDIT_LOG_PATH), { recursive: true });
    writeFileSync(AUDIT_LOG_PATH, restoredLines.join("\n") + "\n");
  });

  it("returns only records for the current session without sensitive pending-plan fields", async () => {
    const sessionId = `audit-test-${Date.now()}`;
    const otherSessionId = `audit-other-${Date.now()}`;
    appendAuditRecord({
      id: "audit-test-preview",
      createdAt: "2026-04-30T00:00:00.000Z",
      sessionId,
      event: "preview_prepared",
      tool: "bundle_launch",
      planId: "plan_bundle_launch_1_0_10",
      outcome: "Waiting for confirm",
    });
    appendAuditRecord({
      id: "audit-test-executed",
      createdAt: "2026-04-30T00:00:01.000Z",
      sessionId,
      event: "mock_executed",
      tool: "bundle_launch",
      planId: "plan_bundle_launch_1_0_10",
      outcome: "MockMint1111... returned",
    });
    appendAuditRecord({
      id: "audit-test-other-session",
      createdAt: "2026-04-30T00:00:02.000Z",
      sessionId: otherSessionId,
      event: "preview_prepared",
      tool: "bundle_swap",
      planId: "plan_bundle_swap_token_to_sol_1",
      outcome: "Waiting for confirm",
    });

    const auditResponse = await GET(
      requestWithCookie(`smithii_agent_session=${sessionId}`),
    );
    const audit = await responseJson(auditResponse);

    expect(auditResponse.status).toBe(200);
    const records = audit.records as Array<Record<string, unknown>>;

    expect(records).toMatchObject([
      {
        event: "preview_prepared",
        tool: "bundle_launch",
        planId: "plan_bundle_launch_1_0_10",
      },
      {
        event: "mock_executed",
        tool: "bundle_launch",
        planId: "plan_bundle_launch_1_0_10",
      },
    ]);
    expect(JSON.stringify(audit)).not.toContain(otherSessionId);
    expect(JSON.stringify(audit)).not.toContain("privateKey");
    expect(JSON.stringify(audit)).not.toContain("signature");
  });

  it("strips unexpected sensitive fields from stored audit records", async () => {
    const sessionId = `audit-poisoned-${Date.now()}`;
    writeAuditLines([
      {
        id: "audit-poisoned-record",
        createdAt: "2026-04-30T00:00:00.000Z",
        sessionId,
        event: "preview_prepared",
        tool: "bundle_launch",
        planId: "plan_bundle_launch_1_0_10",
        outcome: "Waiting for confirm",
        privateKey: "PRIVATE_KEY_SHOULD_NOT_ECHO",
        signature: "SIGNATURE_SHOULD_NOT_ECHO",
      },
    ]);

    const auditResponse = await GET(
      requestWithCookie(`smithii_agent_session=${sessionId}`),
    );
    const audit = await responseJson(auditResponse);

    expect(auditResponse.status).toBe(200);
    expect(audit.records).toMatchObject([
      {
        event: "preview_prepared",
        tool: "bundle_launch",
        planId: "plan_bundle_launch_1_0_10",
      },
    ]);
    expect(JSON.stringify(audit)).not.toContain("PRIVATE_KEY_SHOULD_NOT_ECHO");
    expect(JSON.stringify(audit)).not.toContain("SIGNATURE_SHOULD_NOT_ECHO");
  });

  it("keeps valid audit records readable when one local line is malformed", async () => {
    const sessionId = `audit-malformed-${Date.now()}`;
    mkdirSync(path.dirname(AUDIT_LOG_PATH), { recursive: true });
    writeFileSync(
      AUDIT_LOG_PATH,
      [
        JSON.stringify({
          id: "audit-valid-before-malformed",
          createdAt: "2026-04-30T00:00:00.000Z",
          sessionId,
          event: "preview_prepared",
          tool: "bundle_launch",
          planId: "plan_bundle_launch_1_0_10",
          outcome: "Waiting for confirm",
        }),
        "{bad json",
      ].join("\n") + "\n",
    );

    const auditResponse = await GET(
      requestWithCookie(`smithii_agent_session=${sessionId}`),
    );
    const audit = await responseJson(auditResponse);

    expect(auditResponse.status).toBe(200);
    expect(audit.records).toMatchObject([
      {
        event: "preview_prepared",
        tool: "bundle_launch",
        planId: "plan_bundle_launch_1_0_10",
      },
    ]);
  });

  it("returns an empty audit log when no session cookie exists", async () => {
    const auditResponse = await GET(new Request("http://localhost/api/audit-log"));

    expect(auditResponse.status).toBe(200);
    expect(await responseJson(auditResponse)).toEqual({ records: [] });
  });
});

async function responseJson(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

function requestWithCookie(cookie: string) {
  return new Request("http://localhost/api/audit-log", {
    headers: { Cookie: cookie },
  });
}

function writeAuditLines(records: Array<Record<string, unknown>>) {
  mkdirSync(path.dirname(AUDIT_LOG_PATH), { recursive: true });
  writeFileSync(
    AUDIT_LOG_PATH,
    records.map((record) => JSON.stringify(record)).join("\n") + "\n",
  );
}
