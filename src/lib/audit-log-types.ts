import type { PendingPlan } from "@/lib/agent/mock-chat";

export type AuditLogRecord = {
  id: string;
  createdAt: string;
  sessionId: string;
  event:
    | "preview_prepared"
    | "mock_executed"
    | "confirmation_rejected"
    | "confirmation_expired";
  tool?: PendingPlan["tool"];
  planId?: string;
  outcome: string;
};
