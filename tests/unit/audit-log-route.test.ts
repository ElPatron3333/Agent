import { describe, expect, it } from "vitest";

import { GET } from "../../src/app/api/audit-log/route";
import { appendAuditRecord } from "../../src/lib/audit-log";

describe("/api/audit-log route", () => {
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
