import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import {
  closeSync,
  existsSync,
  statSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

import {
  handleMockChat,
  type BundleLaunchDraft,
  type BundleSwapDraft,
  type VolumeBotDraft,
  type MockChatResult,
  type Draft,
  type PendingPlan,
} from "@/lib/agent/mock-chat";
import {
  appendAuditRecord,
  auditRecordForRejectedPrivateKey,
  auditRecordForRejectedPendingPlan,
  auditRecordForResult,
} from "@/lib/audit-log";
import { normalizeGlobalSettings } from "@/lib/global-settings";
import { resolvePlanSigningSecret } from "@/lib/plan-signing-secret";
import { consumeExecuteAttempt } from "@/lib/rate-limit";
import { VOLUME_BOT_SELL_STRATEGY_LEG_LIMIT } from "@/lib/smithii/types";
import type {
  LaunchWalletSelection,
  SwapWalletSelection,
  VolumeWalletSelection,
} from "@/lib/wallet-roster";

type ChatRequest = {
  message?: unknown;
  pendingPlan?: unknown;
  draft?: unknown;
  launchWalletSelection?: unknown;
  swapWalletSelection?: unknown;
  volumeWalletSelection?: unknown;
  globalSettings?: unknown;
};

const SESSION_COOKIE_NAME = "smithii_agent_session";

const PENDING_PLAN_TOOLS = new Set([
  "bundle_launch",
  "bundle_swap",
  "volume_bot",
  "launch_volume_sequence",
]);
const PRIVATE_KEY_FIELD_NAMES = new Set([
  "mnemonic",
  "pk",
  "privatekey",
  "privatekeys",
  "private_key",
  "privkeys",
  "secretkey",
  "seedphrase",
]);

type PlanRecord = {
  pendingPlan: PendingPlan;
  status: "pending" | "consumed";
};

const LEGACY_PLAN_RECORDS_PATH = path.join(
  process.cwd(),
  ".smithii-local",
  "plan-records.json",
);
const PLAN_RECORDS_DIR = path.join(process.cwd(), ".smithii-local", "plan-records");
const STALE_PLAN_LOCK_MS = 5 * 60 * 1000;

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

  const sessionId = getOrCreateSessionId(request);

  if (containsPrivateKeyField(parsedBody)) {
    appendAuditRecord(auditRecordForRejectedPrivateKey({ sessionId }));
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const body = parsedBody as ChatRequest;

  if (typeof body.message !== "string" || body.message.trim().length === 0) {
    return NextResponse.json(
      { error: "Message is required." },
      { status: 400 },
    );
  }

  const pendingPlan = parseIncomingPendingPlan(body.pendingPlan, sessionId);

  if (pendingPlan === "invalid") {
    appendAuditRecord(
      auditRecordForRejectedPendingPlan({
        pendingPlan: body.pendingPlan,
        sessionId,
        outcome: "Invalid pending plan.",
      }),
    );
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

  const swapWalletSelection = parseSwapWalletSelection(body.swapWalletSelection);
  if (swapWalletSelection === "invalid") {
    return NextResponse.json(
      { error: "Invalid swap wallet selection." },
      { status: 400 },
    );
  }

  if (!swapWalletSelectionMatchesDraft(swapWalletSelection, draft)) {
    return NextResponse.json(
      { error: "Invalid swap wallet selection." },
      { status: 400 },
    );
  }

  const volumeWalletSelection = parseVolumeWalletSelection(
    body.volumeWalletSelection,
  );
  if (volumeWalletSelection === "invalid") {
    return NextResponse.json(
      { error: "Invalid volume wallet selection." },
      { status: 400 },
    );
  }

  if (completeVolumeBotDraftNeedsWallet(draft) && !volumeWalletSelection) {
    return NextResponse.json(
      { error: "Invalid volume wallet selection." },
      { status: 400 },
    );
  }

  if (pendingPlan && draft && isConfirmMessage(body.message)) {
    return NextResponse.json(
      { error: "Confirm requests cannot include a draft." },
      { status: 400 },
    );
  }

  if (pendingPlan && isConfirmMessage(body.message)) {
    const executeAttempt = consumeExecuteAttempt({ key: sessionId });
    if (!executeAttempt.allowed) {
      appendAuditRecord(
        auditRecordForRejectedPendingPlan({
          pendingPlan,
          sessionId,
          outcome: "Rate limited.",
        }),
      );
      return NextResponse.json(
        { error: "Too many execute attempts. Try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(executeAttempt.retryAfterSeconds) },
        },
      );
    }

    if (!claimPlanRecord(sessionId, pendingPlan)) {
      appendAuditRecord(
        auditRecordForRejectedPendingPlan({
          pendingPlan,
          sessionId,
          outcome: "Invalid pending plan.",
        }),
      );
      return NextResponse.json(
        { error: "Invalid pending plan." },
        { status: 400 },
      );
    }
  }

  const result = handleMockChat({
    message: body.message,
    pendingPlan,
    draft,
    launchWalletSelection,
    swapWalletSelection,
    volumeWalletSelection,
    globalSettings: normalizeGlobalSettings(body.globalSettings),
  });
  appendAuditRecord(
    auditRecordForResult({
      result,
      sessionId,
      consumedPlan: pendingPlan,
    }),
  );

  const response = NextResponse.json(signPendingPlanInResult(result, sessionId), {
    status: result.executionStatus === "Preview expired" ? 410 : 200,
  });
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

function parseSwapWalletSelection(
  value: unknown,
): SwapWalletSelection | null | "invalid" {
  if (value === undefined || value === null) {
    return null;
  }

  if (!isRecord(value) || !Array.isArray(value.participatingWallets)) {
    return "invalid";
  }

  const participatingWallets = value.participatingWallets.map((wallet) => {
    if (
      !isRecord(wallet) ||
      typeof wallet.pubkey !== "string" ||
      typeof wallet.solBalance !== "number" ||
      !Number.isFinite(wallet.solBalance) ||
      wallet.solBalance < 0 ||
      typeof wallet.tokenBalance !== "number" ||
      !Number.isFinite(wallet.tokenBalance) ||
      wallet.tokenBalance < 0
    ) {
      return null;
    }

    return {
      pubkey: wallet.pubkey,
      solBalance: wallet.solBalance,
      tokenBalance: wallet.tokenBalance,
    };
  });

  if (
    participatingWallets.some((wallet) => wallet === null) ||
    participatingWallets.length > 20
  ) {
    return "invalid";
  }

  return {
    participatingWallets:
      participatingWallets as SwapWalletSelection["participatingWallets"],
  };
}

function parseVolumeWalletSelection(
  value: unknown,
): VolumeWalletSelection | null | "invalid" {
  if (value === undefined || value === null) {
    return null;
  }

  if (!isRecord(value) || typeof value.volumeWalletPubkey !== "string") {
    return "invalid";
  }

  if (value.volumeWalletPubkey.trim().length === 0) {
    return "invalid";
  }

  return {
    volumeWalletPubkey: value.volumeWalletPubkey,
  };
}

function parseDraft(value: unknown): Draft | null | "invalid" {
  if (value === undefined || value === null) {
    return null;
  }

  if (!isRecord(value) || !isRecord(value.data)) {
    return "invalid";
  }

  if (value.tool === "bundle_swap") {
    const data = parseBundleSwapDraftData(value.data);
    if (data === "invalid") {
      return "invalid";
    }

    return {
      tool: "bundle_swap",
      data,
    };
  }

  if (value.tool === "volume_bot") {
    const data = parseVolumeBotDraftData(value.data);
    if (data === "invalid") {
      return "invalid";
    }

    return {
      tool: "volume_bot",
      data,
    };
  }

  if (value.tool !== "bundle_launch") {
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

function parseBundleSwapDraftData(
  value: Record<string, unknown>,
): BundleSwapDraft["data"] | "invalid" {
  const data: BundleSwapDraft["data"] = {};

  if (value.direction !== undefined) {
    if (
      value.direction !== "sol_to_token" &&
      value.direction !== "token_to_sol" &&
      value.direction !== "token_to_token"
    ) {
      return "invalid";
    }
    data.direction = value.direction;
  }

  for (const key of ["fromToken", "toToken"] as const) {
    if (value[key] !== undefined) {
      if (typeof value[key] !== "string" || value[key].trim().length === 0) {
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
      value.walletCount > 20
    ) {
      return "invalid";
    }
    data.walletCount = value.walletCount;
  }

  if (value.quantityMode !== undefined) {
    if (!isRecord(value.quantityMode)) {
      return "invalid";
    }
    const quantityMode = parseBundleSwapQuantityMode(value.quantityMode);
    if (quantityMode === "invalid") {
      return "invalid";
    }
    data.quantityMode = quantityMode;
  }

  if (value.pendingQuantityModeType !== undefined) {
    if (
      value.pendingQuantityModeType !== "total" &&
      value.pendingQuantityModeType !== "fixed" &&
      value.pendingQuantityModeType !== "random" &&
      value.pendingQuantityModeType !== "random_pct"
    ) {
      return "invalid";
    }
    data.pendingQuantityModeType = value.pendingQuantityModeType;
  }

  if (value.txCount !== undefined) {
    if (
      typeof value.txCount !== "number" ||
      !Number.isInteger(value.txCount) ||
      value.txCount < 1 ||
      value.txCount > 200
    ) {
      return "invalid";
    }
    data.txCount = value.txCount;
  }

  if (value.txDelayBlocks !== undefined) {
    if (
      typeof value.txDelayBlocks !== "number" ||
      !Number.isInteger(value.txDelayBlocks) ||
      value.txDelayBlocks < 0 ||
      value.txDelayBlocks > 100
    ) {
      return "invalid";
    }
    data.txDelayBlocks = value.txDelayBlocks;
  }

  if (value.perTxOverrides !== undefined) {
    if (!isRecord(value.perTxOverrides)) {
      return "invalid";
    }
    const perTxOverrides = parsePerTxOverrides(value.perTxOverrides);
    if (perTxOverrides === "invalid") {
      return "invalid";
    }
    data.perTxOverrides = perTxOverrides;
  }

  return data;
}

function parseVolumeBotDraftData(
  value: Record<string, unknown>,
): VolumeBotDraft["data"] | "invalid" {
  const data: VolumeBotDraft["data"] = {};

  if (value.tokenAddress !== undefined) {
    if (typeof value.tokenAddress !== "string" || value.tokenAddress.trim().length === 0) {
      return "invalid";
    }
    data.tokenAddress = value.tokenAddress;
  }

  if (value.makers !== undefined) {
    if (
      typeof value.makers !== "number" ||
      !Number.isInteger(value.makers) ||
      value.makers < 1 ||
      value.makers > 10000
    ) {
      return "invalid";
    }
    data.makers = value.makers;
  }

  if (value.orderAmount !== undefined) {
    if (!isRecord(value.orderAmount)) {
      return "invalid";
    }
    const orderAmount = parseSolRange(value.orderAmount);
    if (orderAmount === "invalid") {
      return "invalid";
    }
    data.orderAmount = orderAmount;
  }

  if (value.delaySeconds !== undefined) {
    if (!isRecord(value.delaySeconds)) {
      return "invalid";
    }
    const delaySeconds = parseSecondRange(value.delaySeconds);
    if (delaySeconds === "invalid") {
      return "invalid";
    }
    data.delaySeconds = delaySeconds;
  }

  if (value.onPurchase !== undefined) {
    if (
      value.onPurchase !== "auto_sell" &&
      value.onPurchase !== "return_to_wallet"
    ) {
      return "invalid";
    }
    data.onPurchase = value.onPurchase;
  }

  if (value.sellTiming !== undefined) {
    if (value.sellTiming !== "after_each" && value.sellTiming !== "after_all") {
      return "invalid";
    }
    data.sellTiming = value.sellTiming;
  }

  if (value.sellMode !== undefined) {
    if (value.sellMode !== "sell_strategy" && value.sellMode !== "sell_100") {
      return "invalid";
    }
    data.sellMode = value.sellMode;
  }

  if (value.sellStrategy !== undefined) {
    if (!isRecord(value.sellStrategy) || !Array.isArray(value.sellStrategy.legs)) {
      return "invalid";
    }
    if (
      value.sellStrategy.legs.length === 0 ||
      value.sellStrategy.legs.length > VOLUME_BOT_SELL_STRATEGY_LEG_LIMIT
    ) {
      return "invalid";
    }
    const legs = value.sellStrategy.legs.map((leg) => {
      if (
        !isRecord(leg) ||
        !isRecord(leg.sellPct) ||
        !isRecord(leg.delaySeconds)
      ) {
        return null;
      }
      const sellPct = parsePctRange(leg.sellPct);
      const delaySeconds = parseSecondRange(leg.delaySeconds);
      if (sellPct === "invalid" || delaySeconds === "invalid") {
        return null;
      }
      return { sellPct, delaySeconds };
    });
    if (legs.some((leg) => leg === null)) {
      return "invalid";
    }
    data.sellStrategy = {
      legs: legs as NonNullable<VolumeBotDraft["data"]["sellStrategy"]>["legs"],
    };
  }

  if (data.sellMode === "sell_100" && data.sellStrategy) {
    return "invalid";
  }

  return data;
}

function parseBundleSwapQuantityMode(
  value: Record<string, unknown>,
): BundleSwapDraft["data"]["quantityMode"] | "invalid" {
  if (value.type === "total") {
    return numberField(value.totalSol) ? { type: "total", totalSol: value.totalSol } : "invalid";
  }
  if (value.type === "fixed") {
    return numberField(value.perTxSol) ? { type: "fixed", perTxSol: value.perTxSol } : "invalid";
  }
  if (value.type === "random") {
    return numberField(value.minSol) &&
      numberField(value.maxSol) &&
      value.minSol <= value.maxSol
      ? { type: "random", minSol: value.minSol, maxSol: value.maxSol }
      : "invalid";
  }
  if (value.type === "random_pct") {
    return numberField(value.minPct) &&
      numberField(value.maxPct) &&
      value.minPct <= value.maxPct &&
      value.maxPct <= 100
      ? { type: "random_pct", minPct: value.minPct, maxPct: value.maxPct }
      : "invalid";
  }

  return "invalid";
}

function parseSolRange(value: Record<string, unknown>) {
  return numberField(value.minSol) &&
    numberField(value.maxSol) &&
    value.minSol <= value.maxSol
    ? { minSol: value.minSol, maxSol: value.maxSol }
    : "invalid";
}

function parseSecondRange(value: Record<string, unknown>) {
  return numberField(value.min) &&
    numberField(value.max) &&
    value.min <= value.max
    ? { min: value.min, max: value.max }
    : "invalid";
}

function parsePctRange(value: Record<string, unknown>) {
  return numberField(value.min) &&
    numberField(value.max) &&
    value.min <= value.max &&
    value.max <= 100
    ? { min: value.min, max: value.max }
    : "invalid";
}

function parsePerTxOverrides(
  value: Record<string, unknown>,
): BundleSwapDraft["data"]["perTxOverrides"] | "invalid" {
  const perTxOverrides: NonNullable<BundleSwapDraft["data"]["perTxOverrides"]> =
    {};

  for (const key of ["slippagePct", "gas", "priority"] as const) {
    if (value[key] !== undefined) {
      if (!numberField(value[key])) {
        return "invalid";
      }
      perTxOverrides[key] = value[key];
    }
  }

  if (value.mevShield !== undefined) {
    if (typeof value.mevShield !== "boolean") {
      return "invalid";
    }
    perTxOverrides.mevShield = value.mevShield;
  }

  return perTxOverrides;
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

function swapWalletSelectionMatchesDraft(
  swapWalletSelection: SwapWalletSelection | null,
  draft: Draft | null,
) {
  if (draft?.tool !== "bundle_swap") {
    return true;
  }

  const { walletCount } = draft.data;
  if (walletCount === undefined) {
    return true;
  }

  if (!swapWalletSelection) {
    return false;
  }

  return swapWalletSelection.participatingWallets.length >= walletCount;
}

function completeVolumeBotDraftNeedsWallet(draft: Draft | null) {
  if (draft?.tool !== "volume_bot") {
    return false;
  }

  const data = draft.data;
  if (
    !data.tokenAddress ||
    !data.makers ||
    !data.orderAmount ||
    !data.delaySeconds ||
    !data.onPurchase ||
    !data.sellTiming ||
    !data.sellMode
  ) {
    return false;
  }

  return data.sellMode === "sell_100" || Boolean(data.sellStrategy);
}

function numberField(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isConfirmMessage(message: string) {
  return /^(confirm|launch|start|go|yes|execute)$/.test(
    message.trim().toLowerCase(),
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
  return createHmac("sha256", resolvePlanSigningSecret())
    .update(`${pendingPlan.id}:${pendingPlan.tool}:${pendingPlan.createdAt}`)
    .digest("base64url");
}

function getPlanRecord(sessionId: string, planId: string) {
  const recordPath = planRecordPath(sessionId, planId);
  if (existsSync(recordPath)) {
    return readPlanRecordFile(recordPath);
  }

  return readLegacyPlanRecords()[planRecordKey(sessionId, planId)] ?? null;
}

function setPlanRecord(sessionId: string, planId: string, record: PlanRecord) {
  writePlanRecordFile(planRecordPath(sessionId, planId), record);
}

function claimPlanRecord(sessionId: string, pendingPlan: PendingPlan) {
  const recordPath = planRecordPath(sessionId, pendingPlan.id);
  const lockPath = `${recordPath}.lock`;
  mkdirSync(path.dirname(recordPath), { recursive: true });

  let lockHandle: number;
  try {
    lockHandle = openSync(lockPath, "wx");
  } catch {
    clearStalePlanLock(lockPath);
    try {
      lockHandle = openSync(lockPath, "wx");
    } catch {
    return false;
    }
  }

  try {
    const record = getPlanRecord(sessionId, pendingPlan.id);
    if (!record || !planRecordMatches(record, pendingPlan)) {
      return false;
    }
    if (record.status !== "pending") {
      return false;
    }

    writePlanRecordFile(recordPath, {
      ...record,
      status: "consumed",
    });
    return true;
  } finally {
    closeSync(lockHandle);
    try {
      unlinkSync(lockPath);
    } catch {
    }
  }
}

function clearStalePlanLock(lockPath: string) {
  try {
    if (Date.now() - statSync(lockPath).mtimeMs > STALE_PLAN_LOCK_MS) {
      unlinkSync(lockPath);
    }
  } catch {
  }
}

function readPlanRecordFile(recordPath: string): PlanRecord | null {
  try {
    const parsed = JSON.parse(readFileSync(recordPath, "utf8"));
    if (isPlanRecord(parsed)) {
      return parsed;
    }
  } catch {
    quarantineFile(recordPath);
    return null;
  }

  quarantineFile(recordPath);
  return null;
}

function writePlanRecordFile(recordPath: string, record: PlanRecord) {
  mkdirSync(path.dirname(recordPath), { recursive: true });
  const tempPath = `${recordPath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tempPath, JSON.stringify(record, null, 2));
  renameSync(tempPath, recordPath);
}

function readLegacyPlanRecords(): Record<string, PlanRecord> {
  if (!existsSync(LEGACY_PLAN_RECORDS_PATH)) {
    return {};
  }

  try {
    const parsed = JSON.parse(readFileSync(LEGACY_PLAN_RECORDS_PATH, "utf8"));
    if (!isRecord(parsed)) {
      quarantineFile(LEGACY_PLAN_RECORDS_PATH);
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, PlanRecord] => isPlanRecord(entry[1]),
      ),
    );
  } catch {
    quarantineFile(LEGACY_PLAN_RECORDS_PATH);
    return {};
  }
}

function planRecordKey(sessionId: string, planId: string) {
  return `${sessionId}:${planId}`;
}

function planRecordPath(sessionId: string, planId: string) {
  const digest = createHash("sha256")
    .update(planRecordKey(sessionId, planId))
    .digest("hex");
  return path.join(PLAN_RECORDS_DIR, `${digest}.json`);
}

function planRecordMatches(record: PlanRecord | null, pendingPlan: PendingPlan) {
  return (
    record?.pendingPlan.id === pendingPlan.id &&
    record.pendingPlan.tool === pendingPlan.tool &&
    record.pendingPlan.createdAt === pendingPlan.createdAt &&
    record.pendingPlan.signature === pendingPlan.signature
  );
}

function isPlanRecord(value: unknown): value is PlanRecord {
  return (
    isRecord(value) &&
    (value.status === "pending" || value.status === "consumed") &&
    isRecord(value.pendingPlan) &&
    typeof value.pendingPlan.id === "string" &&
    PENDING_PLAN_TOOLS.has(String(value.pendingPlan.tool)) &&
    typeof value.pendingPlan.createdAt === "number" &&
    Number.isFinite(value.pendingPlan.createdAt) &&
    typeof value.pendingPlan.signature === "string"
  );
}

function quarantineFile(filePath: string) {
  try {
    renameSync(filePath, `${filePath}.corrupt-${Date.now()}`);
  } catch {
    return;
  }
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
      isPrivateKeyFieldName(key) || containsPrivateKeyField(nestedValue),
  );
}

function isPrivateKeyFieldName(key: string) {
  return PRIVATE_KEY_FIELD_NAMES.has(key.toLowerCase());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
