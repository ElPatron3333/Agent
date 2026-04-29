import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

import {
  handleMockChat,
  type BundleLaunchDraft,
  type MockChatResult,
  type Draft,
  type PendingPlan,
} from "@/lib/agent/mock-chat";
import { normalizeGlobalSettings } from "@/lib/global-settings";
import type { LaunchWalletSelection } from "@/lib/wallet-roster";

type ChatRequest = {
  message?: unknown;
  pendingPlan?: unknown;
  draft?: unknown;
  launchWalletSelection?: unknown;
  globalSettings?: unknown;
};

const PLAN_SIGNING_SECRET =
  process.env.SMITHII_PLAN_SIGNING_SECRET ??
  "smithii-agent-local-plan-signing-secret";
const SESSION_COOKIE_NAME = "smithii_agent_session";

const PENDING_PLAN_TOOLS = new Set([
  "bundle_launch",
  "bundle_swap",
  "volume_bot",
]);

type PlanRecord = {
  pendingPlan: PendingPlan;
  status: "pending" | "consumed";
};

type AuditLogRecord = {
  id: string;
  createdAt: string;
  sessionId: string;
  event: "preview_prepared" | "mock_executed";
  tool: PendingPlan["tool"];
  planId: string;
  outcome: string;
};

const PLAN_RECORDS_PATH = path.join(
  process.cwd(),
  ".smithii-local",
  "plan-records.json",
);
const AUDIT_LOG_PATH = path.join(
  process.cwd(),
  ".smithii-local",
  "audit-log.json",
);

export async function POST(request: Request) {
  let parsedBody: unknown;
  try {
    parsedBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (!isRecord(parsedBody)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (containsPrivateKeyField(parsedBody)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const body = parsedBody as ChatRequest;

  if (typeof body.message !== "string" || body.message.trim().length === 0) {
    return NextResponse.json(
      { error: "Message is required." },
      { status: 400 },
    );
  }

  const sessionId = getOrCreateSessionId(request);
  const pendingPlan = parseIncomingPendingPlan(body.pendingPlan, sessionId);
  if (pendingPlan === "invalid") {
    return NextResponse.json(
      { error: "Invalid pending plan." },
      { status: 400 },
    );
  }

  const draft = parseDraft(body.draft);
  if (draft === "invalid") {
    return NextResponse.json({ error: "Invalid draft." }, { status: 400 });
  }

  const launchWalletSelection = parseLaunchWalletSelection(
    body.launchWalletSelection,
  );
  if (launchWalletSelection === "invalid") {
    return NextResponse.json(
      { error: "Invalid launch wallet selection." },
      { status: 400 },
    );
  }

  if (!launchWalletSelectionMatchesDraft(launchWalletSelection, draft)) {
    return NextResponse.json(
      { error: "Invalid launch wallet selection." },
      { status: 400 },
    );
  }

  const result = handleMockChat({
    message: body.message,
    pendingPlan,
    draft,
    launchWalletSelection,
    globalSettings: normalizeGlobalSettings(body.globalSettings),
  });
  appendAuditRecord(auditRecordForResult(result, sessionId, pendingPlan));
  if (pendingPlan) {
    consumePlanRecord(sessionId, pendingPlan);
  }

  const response = NextResponse.json(signPendingPlanInResult(result, sessionId));
  response.cookies.set(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });

  return response;
}

function parseIncomingPendingPlan(
  value: unknown,
  sessionId: string,
): PendingPlan | null | "invalid" {
  if (value === undefined || value === null) {
    return null;
  }

  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.tool !== "string" ||
    !PENDING_PLAN_TOOLS.has(value.tool) ||
    typeof value.createdAt !== "number" ||
    !Number.isFinite(value.createdAt) ||
    value.createdAt > Date.now() + 1_000 ||
    typeof value.signature !== "string"
  ) {
    return "invalid";
  }

  const pendingPlan = {
    id: value.id,
    tool: value.tool as PendingPlan["tool"],
    createdAt: value.createdAt,
  };

  if (!isValidPlanSignature(pendingPlan, value.signature)) {
    return "invalid";
  }

  const signedPlan = { ...pendingPlan, signature: value.signature };
  const record = getPlanRecord(sessionId, signedPlan.id);
  if (
    !record ||
    record.status !== "pending" ||
    record.pendingPlan.id !== signedPlan.id ||
    record.pendingPlan.tool !== signedPlan.tool ||
    record.pendingPlan.createdAt !== signedPlan.createdAt ||
    record.pendingPlan.signature !== signedPlan.signature
  ) {
    return "invalid";
  }

  return signedPlan;
}

function parseLaunchWalletSelection(
  value: unknown,
): LaunchWalletSelection | null | "invalid" {
  if (value === undefined || value === null) {
    return null;
  }

  if (
    !isRecord(value) ||
    typeof value.devWalletPubkey !== "string" ||
    !Array.isArray(value.bundleWallets)
  ) {
    return "invalid";
  }

  const bundleWallets = value.bundleWallets.map((wallet) => {
    if (
      !isRecord(wallet) ||
      typeof wallet.pubkey !== "string" ||
      typeof wallet.buyAmountSol !== "number" ||
      !Number.isFinite(wallet.buyAmountSol) ||
      wallet.buyAmountSol <= 0
    ) {
      return null;
    }

    return {
      pubkey: wallet.pubkey,
      buyAmountSol: wallet.buyAmountSol,
    };
  });

  if (bundleWallets.some((wallet) => wallet === null)) {
    return "invalid";
  }

  return {
    devWalletPubkey: value.devWalletPubkey,
    bundleWallets: bundleWallets as LaunchWalletSelection["bundleWallets"],
  };
}

function parseDraft(value: unknown): Draft | null | "invalid" {
  if (value === undefined || value === null) {
    return null;
  }

  if (
    !isRecord(value) ||
    value.tool !== "bundle_launch" ||
    !isRecord(value.data)
  ) {
    return "invalid";
  }

  const data = parseBundleLaunchDraftData(value.data);
  if (data === "invalid") {
    return "invalid";
  }

  return {
    tool: "bundle_launch",
    data,
  };
}

function parseBundleLaunchDraftData(
  value: Record<string, unknown>,
): BundleLaunchDraft["data"] | "invalid" {
  const data: BundleLaunchDraft["data"] = {};

  for (const key of [
    "tokenName",
    "symbol",
    "description",
    "imageFileName",
  ] as const) {
    if (value[key] !== undefined) {
      if (typeof value[key] !== "string") {
        return "invalid";
      }
      data[key] = value[key];
    }
  }

  if (value.walletCount !== undefined) {
    if (
      typeof value.walletCount !== "number" ||
      !Number.isInteger(value.walletCount) ||
      value.walletCount < 1 ||
      value.walletCount > 15
    ) {
      return "invalid";
    }
    data.walletCount = value.walletCount;
  }

  if (value.solPerWallet !== undefined) {
    if (
      typeof value.solPerWallet !== "number" ||
      !Number.isFinite(value.solPerWallet) ||
      value.solPerWallet <= 0
    ) {
      return "invalid";
    }
    data.solPerWallet = value.solPerWallet;
  }

  for (const key of [
    "socialsEnabled",
    "cashbackCoin",
    "useDifferentBlocks",
    "pregenerateTokenAddress",
  ] as const) {
    if (value[key] !== undefined) {
      if (typeof value[key] !== "boolean") {
        return "invalid";
      }
      data[key] = value[key];
    }
  }

  if (value.socialStep !== undefined) {
    if (
      value.socialStep !== "website" &&
      value.socialStep !== "telegram" &&
      value.socialStep !== "twitter" &&
      value.socialStep !== "done"
    ) {
      return "invalid";
    }
    data.socialStep = value.socialStep;
  }

  if (value.socials !== undefined) {
    if (!isRecord(value.socials)) {
      return "invalid";
    }
    const socials = parseSocials(value.socials);
    if (socials === "invalid") {
      return "invalid";
    }
    data.socials = socials;
  }

  return data;
}

function parseSocials(
  value: Record<string, unknown>,
): BundleLaunchDraft["data"]["socials"] | "invalid" {
  const socials: NonNullable<BundleLaunchDraft["data"]["socials"]> = {};

  for (const key of ["website", "telegram", "twitter"] as const) {
    if (value[key] !== undefined) {
      if (typeof value[key] !== "string") {
        return "invalid";
      }
      socials[key] = value[key];
    }
  }

  return socials;
}

function launchWalletSelectionMatchesDraft(
  launchWalletSelection: LaunchWalletSelection | null,
  draft: Draft | null,
) {
  if (!launchWalletSelection || draft?.tool !== "bundle_launch") {
    return true;
  }

  const { walletCount, solPerWallet } = draft.data;
  if (walletCount === undefined || solPerWallet === undefined) {
    return true;
  }

  return (
    launchWalletSelection.bundleWallets.length === walletCount &&
    launchWalletSelection.bundleWallets.every(
      (wallet) => wallet.buyAmountSol === solPerWallet,
    )
  );
}

function signPendingPlanInResult(
  result: MockChatResult,
  sessionId: string,
): MockChatResult {
  if (!result.pendingPlan) {
    return result;
  }
  const pendingPlan = signPendingPlan(result.pendingPlan);
  setPlanRecord(sessionId, pendingPlan.id, {
    pendingPlan,
    status: "pending",
  });

  return {
    ...result,
    pendingPlan,
  };
}

function auditRecordForResult(
  result: MockChatResult,
  sessionId: string,
  consumedPlan: PendingPlan | null,
): AuditLogRecord | null {
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

function isExecutionOutcome(executionStatus: string) {
  return (
    executionStatus === "Mock swap signature returned" ||
    executionStatus === "Volume bot started" ||
    executionStatus.endsWith("... returned")
  );
}

function appendAuditRecord(record: AuditLogRecord | null) {
  if (!record) {
    return;
  }

  writeAuditLog([...readAuditLog(), record]);
}

function readAuditLog(): AuditLogRecord[] {
  if (!existsSync(AUDIT_LOG_PATH)) {
    return [];
  }

  try {
    return JSON.parse(readFileSync(AUDIT_LOG_PATH, "utf8")) as AuditLogRecord[];
  } catch {
    return [];
  }
}

function writeAuditLog(records: AuditLogRecord[]) {
  mkdirSync(path.dirname(AUDIT_LOG_PATH), { recursive: true });
  writeFileSync(AUDIT_LOG_PATH, JSON.stringify(records, null, 2));
}

function signPendingPlan(pendingPlan: PendingPlan): PendingPlan {
  return {
    ...pendingPlan,
    signature: signPlanPayload(pendingPlan),
  };
}

function isValidPlanSignature(
  pendingPlan: Omit<PendingPlan, "signature">,
  signature: string,
) {
  const expected = signPlanPayload(pendingPlan);
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);

  return (
    expectedBuffer.length === signatureBuffer.length &&
    timingSafeEqual(expectedBuffer, signatureBuffer)
  );
}

function signPlanPayload(pendingPlan: Omit<PendingPlan, "signature">) {
  return createHmac("sha256", PLAN_SIGNING_SECRET)
    .update(`${pendingPlan.id}:${pendingPlan.tool}:${pendingPlan.createdAt}`)
    .digest("base64url");
}

function consumePlanRecord(sessionId: string, pendingPlan: PendingPlan) {
  const key = planRecordKey(sessionId, pendingPlan.id);
  const record = readPlanRecords()[key];
  if (!record) {
    return;
  }

  writePlanRecords({
    ...readPlanRecords(),
    [key]: {
      ...record,
      status: "consumed",
    },
  });
}

function getPlanRecord(sessionId: string, planId: string) {
  return readPlanRecords()[planRecordKey(sessionId, planId)];
}

function setPlanRecord(sessionId: string, planId: string, record: PlanRecord) {
  writePlanRecords({
    ...readPlanRecords(),
    [planRecordKey(sessionId, planId)]: record,
  });
}

function readPlanRecords(): Record<string, PlanRecord> {
  if (!existsSync(PLAN_RECORDS_PATH)) {
    return {};
  }

  try {
    return JSON.parse(readFileSync(PLAN_RECORDS_PATH, "utf8")) as Record<
      string,
      PlanRecord
    >;
  } catch {
    return {};
  }
}

function writePlanRecords(records: Record<string, PlanRecord>) {
  mkdirSync(path.dirname(PLAN_RECORDS_PATH), { recursive: true });
  writeFileSync(PLAN_RECORDS_PATH, JSON.stringify(records, null, 2));
}

function planRecordKey(sessionId: string, planId: string) {
  return `${sessionId}:${planId}`;
}

function getOrCreateSessionId(request: Request) {
  const cookies = request.headers.get("cookie") ?? "";
  const sessionCookie = cookies
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${SESSION_COOKIE_NAME}=`));

  return sessionCookie?.slice(`${SESSION_COOKIE_NAME}=`.length) || randomUUID();
}

function containsPrivateKeyField(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsPrivateKeyField);
  }

  if (!isRecord(value)) {
    return false;
  }

  return Object.entries(value).some(
    ([key, nestedValue]) =>
      key === "privateKey" || containsPrivateKeyField(nestedValue),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
