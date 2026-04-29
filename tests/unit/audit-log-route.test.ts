import { describe, expect, it } from "vitest";

import { GET } from "../../src/app/api/audit-log/route";
import { appendAuditRecord } from "../../src/lib/audit-log";

describe("/api/audit-log route", () => {
  it("returns local audit records without sensitive pending-plan fields", async () => {
    const sessionId = `audit-test-${Date.now()}`;
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

    const auditResponse = await GET();
    const audit = await responseJson(auditResponse);

    expect(auditResponse.status).toBe(200);
    const records = (audit.records as Array<Record<string, unknown>>).filter(
      (record) => record.sessionId === sessionId,
    );

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
    expect(JSON.stringify(audit)).not.toContain("privateKey");
    expect(JSON.stringify(audit)).not.toContain("signature");
  });
});

async function responseJson(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}
