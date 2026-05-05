import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "../../src/app/api/chat/route";
import { resetExecuteAttemptRateLimiter } from "../../src/lib/rate-limit";

const AUDIT_LOG_FILE_NAME = process.env.VITEST_POOL_ID
  ? `audit-log-${process.env.VITEST_POOL_ID}.json`
  : "audit-log.json";
const AUDIT_LOG_PATH = path.join(
  process.cwd(),
  ".smithii-local",
  AUDIT_LOG_FILE_NAME,
);
const PLAN_RECORDS_DIR = path.join(process.cwd(), ".smithii-local", "plan-records");

function jsonRequest(body: unknown, cookie?: string) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function responseJson(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}
const PRIVATE_KEY_ALIAS_FIELD_NAMES = new Set([
  "pk",
  "privatekey",
  "privatekeys",
  "private_key",
  "privkeys",
  "secretkey",
  "seedphrase",
]);

function expectNoPrivateKeyAliasFields(value: unknown) {
  expect(privateKeyAliasFieldsIn(value)).toEqual([]);
}

function expectNoRealExecutionClaim(value: unknown) {
  const serialized = JSON.stringify(value).toLowerCase();

  for (const forbidden of [
    "mainnet",
    "sandbox",
    "real tx",
    "live tx",
    "smithii execution succeeded",
    "confirmed on-chain",
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
}

function expectMockConfirmationSafety(
  value: Record<string, unknown>,
  expectedMockMarkers: string[],
) {
  expectNoPrivateKeyAliasFields(value);
  expectNoRealExecutionClaim(value);
  expect(value.smithiiLive).toMatchObject({
    mode: "mock",
    serverExecution: "blocked",
  });

  const serialized = JSON.stringify(value);
  for (const marker of expectedMockMarkers) {
    expect(serialized).toContain(marker);
  }
}

function privateKeyAliasFieldsIn(value: unknown): string[] {
  if (!value || typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap(privateKeyAliasFieldsIn);
  }

  return Object.entries(value).flatMap(([key, nested]) => [
    ...(PRIVATE_KEY_ALIAS_FIELD_NAMES.has(key.toLowerCase()) ? [key] : []),
    ...privateKeyAliasFieldsIn(nested),
  ]);
}

describe("/api/chat route", () => {
  afterEach(() => {
    resetExecuteAttemptRateLimiter();
    vi.useRealTimers();
  });

  it("rejects empty messages", async () => {
    const response = await POST(jsonRequest({ message: "" }));

    expect(response.status).toBe(400);
    expect(await responseJson(response)).toEqual({
      error: "Message is required.",
    });
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{bad json",
      }),
    );

    expect(response.status).toBe(400);
    expect(await responseJson(response)).toEqual({
      error: "Invalid JSON.",
    });
  });

  it("rejects private-key fields anywhere in the request body", async () => {
    const cookie = `smithii_agent_session=private-key-reject-${Date.now()}`;
    const response = await POST(
      jsonRequest(
        {
          message: "no",
          draft: {
            tool: "bundle_launch",
            data: completeLaunchDraftData(),
          },
          launchWalletSelection: {
            devWalletPubkey: "DevWallet...91nP",
            bundleWallets: [
              {
                pubkey: "Injected...1111",
                buyAmountSol: 0.1,
                privateKey: "PRIVATE_KEY_SHOULD_NOT_ECHO",
              },
            ],
          },
        },
        cookie,
      ),
    );

    expect(response.status).toBe(400);
    expect(JSON.stringify(await responseJson(response))).not.toContain(
      "PRIVATE_KEY_SHOULD_NOT_ECHO",
    );
    expect(auditRecordsForSession(sessionIdFromCookie(cookie))).toContainEqual(
      expect.objectContaining({
        event: "private_key_rejected",
        outcome: "Invalid request.",
      }),
    );
  });

  it("rejects forged pending plans that were not signed by the route", async () => {
    const cookie = `smithii_agent_session=reject-${Date.now()}`;
    const response = await POST(
      jsonRequest(
        {
          message: "confirm",
          pendingPlan: {
            id: "forged_plan",
            tool: "bundle_launch",
            createdAt: Date.now(),
          },
        },
        cookie,
      ),
    );

    expect(response.status).toBe(400);
    expect(await responseJson(response)).toEqual({
      error: "Invalid pending plan.",
    });
    expect(auditRecordsForSession(sessionIdFromCookie(cookie))).toContainEqual(
      expect.objectContaining({
        event: "confirmation_rejected",
        planId: "forged_plan",
        tool: "bundle_launch",
        outcome: "Invalid pending plan.",
      }),
    );
  });

  it("signs and stores route-issued pending plans for the current session", async () => {
    const previewResponse = await POST(
      jsonRequest({
        message: "no",
        draft: {
          tool: "bundle_launch",
          data: completeLaunchDraftData(),
        },
        launchWalletSelection: {
          devWalletPubkey: "DevWallet...91nP",
          bundleWallets: [{ pubkey: "BndlWallet...4kd9", buyAmountSol: 0.1 }],
        },
      }),
    );
    const preview = await responseJson(previewResponse);
    const pendingPlan = preview.pendingPlan;

    expect(previewResponse.status).toBe(200);
    expect(JSON.stringify(preview)).not.toContain("privateKey");
    expectNoPrivateKeyAliasFields(preview);
    expect(preview.smithiiLive).toMatchObject({
      mode: "browser-handoff-ready",
      serverExecution: "blocked",
      browserRequiredSignerArgs: ["bundle buyer signer material"],
    });
    expect(pendingPlan).toMatchObject({
      id: "plan_bundle_launch_1_0_10",
      tool: "bundle_launch",
    });
    expect(pendingPlan).toHaveProperty("signature");
    expect(previewResponse.headers.get("set-cookie")).toContain(
      "smithii_agent_session=",
    );
  });

  it("normalizes global settings at the route boundary", async () => {
    const response = await POST(
      jsonRequest({
        message: "no",
        draft: {
          tool: "bundle_launch",
          data: completeLaunchDraftData(),
        },
        launchWalletSelection: {
          devWalletPubkey: "DevWallet...91nP",
          bundleWallets: [{ pubkey: "BndlWallet...4kd9", buyAmountSol: 0.1 }],
        },
        globalSettings: {
          speed: "turbo",
          jitoTip: "not-a-tip",
          mevProtection: "yes",
          slippagePct: 120,
        },
      }),
    );

    const preview = await responseJson(response);

    expect(response.status).toBe(200);
    expect(preview.activePreview).toMatchObject({
      globalSettings: {
        speed: "turbo",
        jitoTip: "default",
        mevProtection: true,
        slippagePct: 100,
      },
    });
  });

  it("rejects malformed drafts at the route boundary", async () => {
    const response = await POST(
      jsonRequest({
        message: "no",
        draft: {
          tool: "bundle_launch",
          data: {
            ...completeLaunchDraftData(),
            walletCount: "1",
          },
        },
      }),
    );

    expect(response.status).toBe(400);
    expect(await responseJson(response)).toEqual({
      error: "Invalid draft.",
    });
  });

  it("rejects launch wallet selections that do not match the draft", async () => {
    const response = await POST(
      jsonRequest({
        message: "no",
        draft: {
          tool: "bundle_launch",
          data: {
            ...completeLaunchDraftData(),
            walletCount: 2,
            solPerWallet: 0.5,
          },
        },
        launchWalletSelection: {
          devWalletPubkey: "DevWallet...91nP",
          bundleWallets: [{ pubkey: "BndlWallet...4kd9", buyAmountSol: 0.5 }],
        },
      }),
    );

    expect(response.status).toBe(400);
    expect(await responseJson(response)).toEqual({
      error: "Invalid launch wallet selection.",
    });
  });

  it("rejects a signed pending plan without the issuing session cookie", async () => {
    const previewResponse = await POST(
      jsonRequest({
        message: "no",
        draft: {
          tool: "bundle_launch",
          data: completeLaunchDraftData(),
        },
        launchWalletSelection: {
          devWalletPubkey: "DevWallet...91nP",
          bundleWallets: [{ pubkey: "BndlWallet...4kd9", buyAmountSol: 0.1 }],
        },
      }),
    );
    const preview = await responseJson(previewResponse);

    const confirmResponse = await POST(
      jsonRequest({
        message: "confirm",
        pendingPlan: preview.pendingPlan,
      }),
    );

    expect(confirmResponse.status).toBe(400);
    expect(await responseJson(confirmResponse)).toEqual({
      error: "Invalid pending plan.",
    });
  });

  it("accepts a stored pending plan only once for the issuing session", async () => {
    const previewResponse = await POST(
      jsonRequest({
        message: "no",
        draft: {
          tool: "bundle_launch",
          data: completeLaunchDraftData(),
        },
        launchWalletSelection: {
          devWalletPubkey: "DevWallet...91nP",
          bundleWallets: [{ pubkey: "BndlWallet...4kd9", buyAmountSol: 0.1 }],
        },
      }),
    );
    const preview = await responseJson(previewResponse);
    const cookie = cookieHeaderFrom(previewResponse);

    const confirmResponse = await POST(
      jsonRequest(
        {
          message: "confirm",
          pendingPlan: preview.pendingPlan,
        },
        cookie,
      ),
    );
    const confirmed = await responseJson(confirmResponse);

    expect(confirmResponse.status).toBe(200);
    expect(JSON.stringify(confirmed)).toContain("Mock Bundle Launch executed");

    const replayResponse = await POST(
      jsonRequest(
        {
          message: "confirm",
          pendingPlan: preview.pendingPlan,
        },
        cookie,
      ),
    );

    expect(replayResponse.status).toBe(400);
    expect(await responseJson(replayResponse)).toEqual({
      error: "Invalid pending plan.",
    });
  });

  it("recovers from stale local claim locks", async () => {
    const previewResponse = await POST(
      jsonRequest({
        message: "no",
        draft: {
          tool: "bundle_launch",
          data: completeLaunchDraftData(),
        },
        launchWalletSelection: {
          devWalletPubkey: "DevWallet...91nP",
          bundleWallets: [{ pubkey: "BndlWallet...4kd9", buyAmountSol: 0.1 }],
        },
      }),
    );
    const preview = await responseJson(previewResponse);
    const cookie = cookieHeaderFrom(previewResponse);
    const pendingPlan = preview.pendingPlan as { id: string };
    const lockPath = `${planRecordPath(sessionIdFromCookie(cookie), pendingPlan.id)}.lock`;
    mkdirSync(path.dirname(lockPath), { recursive: true });
    writeFileSync(lockPath, "stale");
    const staleTime = new Date(Date.now() - 10 * 60 * 1000);
    utimesSync(lockPath, staleTime, staleTime);

    const confirmResponse = await POST(
      jsonRequest(
        {
          message: "confirm",
          pendingPlan: preview.pendingPlan,
        },
        cookie,
      ),
    );

    expect(confirmResponse.status).toBe(200);
    expect(JSON.stringify(await responseJson(confirmResponse))).toContain(
      "Mock Bundle Launch executed",
    );
  });

  it("records bundle launch preview and confirm calls in the local audit log", async () => {
    const previewResponse = await POST(
      jsonRequest({
        message: "no",
        draft: {
          tool: "bundle_launch",
          data: completeLaunchDraftData(),
        },
        launchWalletSelection: {
          devWalletPubkey: "DevWallet...91nP",
          bundleWallets: [{ pubkey: "BndlWallet...4kd9", buyAmountSol: 0.1 }],
        },
      }),
    );
    const preview = await responseJson(previewResponse);
    const cookie = cookieHeaderFrom(previewResponse);
    const sessionId = sessionIdFromCookie(cookie);

    const confirmResponse = await POST(
      jsonRequest(
        {
          message: "confirm",
          pendingPlan: preview.pendingPlan,
        },
        cookie,
      ),
    );

    expect(confirmResponse.status).toBe(200);
    expect(existsSync(AUDIT_LOG_PATH)).toBe(true);

    const records = auditRecordsForSession(sessionId);

    expect(records).toMatchObject([
      {
        event: "preview_prepared",
        tool: "bundle_launch",
        planId: "plan_bundle_launch_1_0_10",
        outcome: "Waiting for confirm",
      },
      {
        event: "mock_executed",
        tool: "bundle_launch",
        planId: "plan_bundle_launch_1_0_10",
      },
    ]);
    expect(JSON.stringify(records)).not.toContain("privateKey");
    expect(JSON.stringify(records)).not.toContain("signature");
  });

  it("accepts bundle swap drafts with public wallet selections and records the audit log", async () => {
    const previewResponse = await POST(
      jsonRequest({
        message: "skip",
        draft: {
          tool: "bundle_swap",
          data: {
            direction: "sol_to_token",
            fromToken: "SOL",
            toToken: "MigratedMint111",
            walletCount: 2,
            quantityMode: { type: "fixed", perTxSol: 0.2 },
            txCount: 2,
            txDelayBlocks: 1,
          },
        },
        swapWalletSelection: {
          participatingWallets: [
            { pubkey: "wallet111", solBalance: 1, tokenBalance: 0 },
            { pubkey: "wallet222", solBalance: 0.01, tokenBalance: 0 },
          ],
        },
      }),
    );
    const preview = await responseJson(previewResponse);
    const cookie = cookieHeaderFrom(previewResponse);
    const sessionId = sessionIdFromCookie(cookie);

    expect(previewResponse.status).toBe(200);
    expect(JSON.stringify(preview)).not.toContain("privateKey");
    expect(preview.pendingPlan).toMatchObject({
      tool: "bundle_swap",
    });
    expectNoPrivateKeyAliasFields(preview);
    expect(preview.smithiiLive).toMatchObject({
      mode: "browser-handoff-ready",
      serverExecution: "blocked",
      browserRequiredSignerArgs: ["bundle swap wallet signer material"],
    });
    expect(preview.activePreview).toMatchObject({
      kind: "bundle_swap",
      routing: "pumpswap_amm",
      readyWallets: 1,
      skippedWallets: 1,
    });

    const confirmResponse = await POST(
      jsonRequest(
        {
          message: "confirm",
          pendingPlan: preview.pendingPlan,
        },
        cookie,
      ),
    );

    expect(confirmResponse.status).toBe(200);
    const confirm = await responseJson(confirmResponse);
    expectNoPrivateKeyAliasFields(confirm);
    expect(confirm.smithiiLive).toMatchObject({
      mode: "mock",
      serverExecution: "blocked",
      browserRequiredSignerArgs: ["bundle swap wallet signer material"],
    });
    expect(auditRecordsForSession(sessionId)).toMatchObject([
      {
        event: "preview_prepared",
        tool: "bundle_swap",
        outcome: "Waiting for confirm",
      },
      {
        event: "mock_executed",
        tool: "bundle_swap",
        outcome: "Mock swap signature returned",
      },
    ]);
  });

  it("serializes token-to-token bundle swaps as blocked for live handoff", async () => {
    const previewResponse = await POST(
      jsonRequest({
        message: "skip",
        draft: {
          tool: "bundle_swap",
          data: {
            direction: "token_to_token",
            fromToken: "SourceMint111",
            toToken: "TargetMint222",
            walletCount: 1,
            quantityMode: { type: "random_pct", minPct: 25, maxPct: 50 },
            txCount: 1,
            txDelayBlocks: 1,
          },
        },
        swapWalletSelection: {
          participatingWallets: [
            { pubkey: "wallet111", solBalance: 1, tokenBalance: 10 },
          ],
        },
      }),
    );
    const preview = await responseJson(previewResponse);

    expect(previewResponse.status).toBe(200);
    expectNoPrivateKeyAliasFields(preview);
    expect(preview.activePreview).toMatchObject({
      kind: "bundle_swap",
      direction: "token_to_token",
    });
    expect(preview.smithiiLive).toMatchObject({
      mode: "blocked-awaiting-smithii",
      serverExecution: "blocked",
      browserRequiredSignerArgs: ["bundle swap wallet signer material"],
      blockers: [
        "@smithii/sdk/pump bundleSellBuy does not expose token-to-token swaps.",
      ],
    });
  });

  it("rejects complete bundle swap drafts without a public wallet selection", async () => {
    const response = await POST(
      jsonRequest({
        message: "skip",
        draft: {
          tool: "bundle_swap",
          data: completeSwapDraftData(),
        },
      }),
    );

    expect(response.status).toBe(400);
    expect(await responseJson(response)).toEqual({
      error: "Invalid swap wallet selection.",
    });
  });

  it("rejects bundle swap drafts outside route-level numeric limits", async () => {
    for (const data of [
      { ...completeSwapDraftData(), txCount: 0 },
      { ...completeSwapDraftData(), txCount: 201 },
      { ...completeSwapDraftData(), txDelayBlocks: 101 },
      {
        ...completeSwapDraftData(),
        quantityMode: { type: "random_pct", minPct: 120, maxPct: 150 },
      },
      {
        ...completeSwapDraftData(),
        quantityMode: { type: "random", minSol: 0.3, maxSol: 0.1 },
      },
    ]) {
      const response = await POST(
        jsonRequest({
          message: "skip",
          draft: {
            tool: "bundle_swap",
            data,
          },
          swapWalletSelection: {
            participatingWallets: [
              { pubkey: "wallet111", solBalance: 1, tokenBalance: 10 },
            ],
          },
        }),
      );

      expect(response.status).toBe(400);
      expect(await responseJson(response)).toEqual({
        error: "Invalid draft.",
      });
    }
  });

  it("accepts volume bot drafts with a public volume wallet selection and records the audit log", async () => {
    const previewResponse = await POST(
      jsonRequest({
        message: "1 to 33 percent, 10 to 20 seconds",
        draft: {
          tool: "volume_bot",
          data: completeVolumeDraftData(),
        },
        volumeWalletSelection: {
          volumeWalletPubkey: "VolumeWallet...5sTq",
        },
      }),
    );
    const preview = await responseJson(previewResponse);
    const cookie = cookieHeaderFrom(previewResponse);
    const sessionId = sessionIdFromCookie(cookie);

    expect(previewResponse.status).toBe(200);
    expect(JSON.stringify(preview)).not.toContain("privateKey");
    expect(preview.pendingPlan).toMatchObject({
      tool: "volume_bot",
    });
    expect(String((preview.pendingPlan as { id: string }).id)).toMatch(
      /^bot_volume_200_Mint111_/,
    );
    expect(preview.pendingPlan).toHaveProperty("signature");
    expect(preview.activePreview).toMatchObject({
      kind: "volume_bot",
      tokenAddress: "Mint111",
      volumeWalletPubkey: "VolumeWallet...5sTq",
      makers: 200,
      sellMode: "sell_strategy",
    });
    expectNoPrivateKeyAliasFields(preview);
    expect(preview.smithiiLive).toMatchObject({
      mode: "blocked-awaiting-smithii",
      serverExecution: "blocked",
      browserRequiredSignerArgs: [],
    });

    const confirmResponse = await POST(
      jsonRequest(
        {
          message: "confirm",
          pendingPlan: preview.pendingPlan,
        },
        cookie,
      ),
    );

    expect(confirmResponse.status).toBe(200);
    const confirm = await responseJson(confirmResponse);
    expectNoPrivateKeyAliasFields(confirm);
    expect(confirm).toMatchObject({
      executionStatus: "Volume bot started",
      smithiiLive: {
        mode: "mock",
        serverExecution: "blocked",
        browserRequiredSignerArgs: [],
      },
      volumeBotRun: {
        runId: `run_${(preview.pendingPlan as { id: string }).id}`,
        state: "running",
      },
    });
    expect(auditRecordsForSession(sessionId)).toMatchObject([
      {
        event: "preview_prepared",
        tool: "volume_bot",
        outcome: "Waiting for confirm",
      },
      {
        event: "mock_executed",
        tool: "volume_bot",
        outcome: "Volume bot started",
      },
    ]);
  });

  it("rejects volume bot drafts outside route-level numeric limits", async () => {
    for (const data of [
      { ...completeVolumeDraftData(), makers: 0 },
      { ...completeVolumeDraftData(), makers: 10001 },
      { ...completeVolumeDraftData(), orderAmount: { minSol: 0.2, maxSol: 0.1 } },
      { ...completeVolumeDraftData(), delaySeconds: { min: 20, max: 10 } },
      {
        ...completeVolumeDraftData(),
        sellStrategy: {
          legs: [],
        },
      },
      {
        ...completeVolumeDraftData(),
        sellStrategy: {
          legs: [
            {
              sellPct: { min: 0, max: 33 },
              delaySeconds: { min: 10, max: 20 },
            },
          ],
        },
      },
      {
        ...completeVolumeDraftData(),
        sellStrategy: {
          legs: [
            {
              sellPct: { min: 1, max: 33 },
              delaySeconds: { min: 10, max: 20 },
            },
            {
              sellPct: { min: 34, max: 66 },
              delaySeconds: { min: 21, max: 30 },
            },
          ],
        },
      },
    ]) {
      const response = await POST(
        jsonRequest({
          message: "skip",
          draft: {
            tool: "volume_bot",
            data,
          },
          volumeWalletSelection: {
            volumeWalletPubkey: "VolumeWallet...5sTq",
          },
        }),
      );

      expect(response.status).toBe(400);
      expect(await responseJson(response)).toEqual({
        error: "Invalid draft.",
      });
    }
  });

  it("rejects complete volume bot drafts without a public volume wallet selection", async () => {
    const response = await POST(
      jsonRequest({
        message: "skip",
        draft: {
          tool: "volume_bot",
          data: completeVolumeDraftData(),
        },
      }),
    );

    expect(response.status).toBe(400);
    expect(await responseJson(response)).toEqual({
      error: "Invalid volume wallet selection.",
    });
  });

  it("rejects confirm requests that also include draft data without consuming the plan", async () => {
    const previewResponse = await POST(
      jsonRequest({
        message: "no",
        draft: {
          tool: "bundle_launch",
          data: completeLaunchDraftData(),
        },
        launchWalletSelection: {
          devWalletPubkey: "DevWallet...91nP",
          bundleWallets: [{ pubkey: "BndlWallet...4kd9", buyAmountSol: 0.1 }],
        },
      }),
    );
    const preview = await responseJson(previewResponse);
    const cookie = cookieHeaderFrom(previewResponse);

    const rejectedResponse = await POST(
      jsonRequest(
        {
          message: "confirm",
          pendingPlan: preview.pendingPlan,
          draft: {
            tool: "bundle_launch",
            data: {
              tokenName: "Other Token",
            },
          },
        },
        cookie,
      ),
    );

    expect(rejectedResponse.status).toBe(400);
    expect(await responseJson(rejectedResponse)).toEqual({
      error: "Confirm requests cannot include a draft.",
    });

    const confirmResponse = await POST(
      jsonRequest(
        {
          message: "confirm",
          pendingPlan: preview.pendingPlan,
        },
        cookie,
      ),
    );

    expect(confirmResponse.status).toBe(200);
    const confirm = await responseJson(confirmResponse);
    expectNoPrivateKeyAliasFields(confirm);
    expect(JSON.stringify(confirm)).toContain(
      "Mock Bundle Launch executed",
    );
    expect(confirm.smithiiLive).toMatchObject({
      mode: "mock",
      serverExecution: "blocked",
      browserRequiredSignerArgs: ["bundle buyer signer material"],
    });
  });

  it("executes a volume bot with start and rejects replay", async () => {
    const previewResponse = await POST(
      jsonRequest({
        message: "1 to 33 percent, 10 to 20 seconds",
        draft: {
          tool: "volume_bot",
          data: completeVolumeDraftData(),
        },
        volumeWalletSelection: {
          volumeWalletPubkey: "VolumeWallet...5sTq",
        },
      }),
    );
    const preview = await responseJson(previewResponse);
    const cookie = cookieHeaderFrom(previewResponse);

    const startResponse = await POST(
      jsonRequest(
        {
          message: "start",
          pendingPlan: preview.pendingPlan,
        },
        cookie,
      ),
    );

    expect(startResponse.status).toBe(200);
    expect(await responseJson(startResponse)).toMatchObject({
      executionStatus: "Volume bot started",
    });

    const replayResponse = await POST(
      jsonRequest(
        {
          message: "start",
          pendingPlan: preview.pendingPlan,
        },
        cookie,
      ),
    );

    expect(replayResponse.status).toBe(400);
    expect(await responseJson(replayResponse)).toEqual({
      error: "Invalid pending plan.",
    });
  });

  it("executes a launch to volume sequence once and rejects replay", async () => {
    const previewResponse = await POST(
      jsonRequest({
        message:
          "launch a token called Blue Frog then start volume after 5 min with momentum template",
        launchWalletSelection: {
          devWalletPubkey: "DevWallet...91nP",
          bundleWallets: [
            { pubkey: "BndlWallet...4kd9", buyAmountSol: 0.3 },
            { pubkey: "BndlWallet...8qa2", buyAmountSol: 0.3 },
          ],
        },
        volumeWalletSelection: {
          volumeWalletPubkey: "BndlWallet...4kd9",
        },
      }),
    );
    const preview = await responseJson(previewResponse);
    const cookie = cookieHeaderFrom(previewResponse);

    expect(previewResponse.status).toBe(200);
    expectNoPrivateKeyAliasFields(preview);
    expect(preview.pendingPlan).toMatchObject({
      tool: "launch_volume_sequence",
    });
    expect(preview.smithiiLive).toMatchObject({
      mode: "blocked-awaiting-smithii",
      serverExecution: "blocked",
      browserRequiredSignerArgs: ["bundle buyer signer material"],
    });

    const confirmResponse = await POST(
      jsonRequest(
        {
          message: "confirm",
          pendingPlan: preview.pendingPlan,
        },
        cookie,
      ),
    );

    expect(confirmResponse.status).toBe(200);
    const confirm = await responseJson(confirmResponse);
    expectNoPrivateKeyAliasFields(confirm);
    expect(confirm).toMatchObject({
      executionStatus: "Launch + Volume sequence queued",
      smithiiLive: {
        mode: "mock",
        serverExecution: "blocked",
        browserRequiredSignerArgs: ["bundle buyer signer material"],
      },
    });

    const replayResponse = await POST(
      jsonRequest(
        {
          message: "confirm",
          pendingPlan: preview.pendingPlan,
        },
        cookie,
      ),
    );

    expect(replayResponse.status).toBe(400);
    expect(await responseJson(replayResponse)).toEqual({
      error: "Invalid pending plan.",
    });
  });

  it("preserves Phase 8C route safety invariants across previews and mock confirmations", async () => {
    const scenarios = [
      {
        name: "bundle launch",
        request: {
          message: "no",
          draft: {
            tool: "bundle_launch",
            data: completeLaunchDraftData(),
          },
          launchWalletSelection: {
            devWalletPubkey: "DevWallet...91nP",
            bundleWallets: [
              { pubkey: "BndlWallet...4kd9", buyAmountSol: 0.1 },
            ],
          },
        },
        previewMode: "browser-handoff-ready",
        mockMarkers: ["Mock Bundle Launch executed", "MockMint"],
      },
      {
        name: "bundle swap SOL to token",
        request: {
          message: "skip",
          draft: {
            tool: "bundle_swap",
            data: {
              direction: "sol_to_token",
              fromToken: "SOL",
              toToken: "MigratedMint111",
              walletCount: 1,
              quantityMode: { type: "fixed", perTxSol: 0.2 },
              txCount: 1,
              txDelayBlocks: 1,
            },
          },
          swapWalletSelection: {
            participatingWallets: [
              { pubkey: "wallet111", solBalance: 1, tokenBalance: 0 },
            ],
          },
        },
        previewMode: "browser-handoff-ready",
        mockMarkers: ["Mock Bundle Swap executed", "MockBundleSwapSignature"],
      },
      {
        name: "bundle swap token to token",
        request: {
          message: "skip",
          draft: {
            tool: "bundle_swap",
            data: {
              direction: "token_to_token",
              fromToken: "SourceMint111",
              toToken: "TargetMint222",
              walletCount: 1,
              quantityMode: { type: "random_pct", minPct: 25, maxPct: 50 },
              txCount: 1,
              txDelayBlocks: 1,
            },
          },
          swapWalletSelection: {
            participatingWallets: [
              { pubkey: "wallet111", solBalance: 1, tokenBalance: 10 },
            ],
          },
        },
        previewMode: "blocked-awaiting-smithii",
        mockMarkers: ["Mock Bundle Swap executed", "MockBundleSwapSignature"],
      },
      {
        name: "volume bot",
        request: {
          message: "1 to 33 percent, 10 to 20 seconds",
          draft: {
            tool: "volume_bot",
            data: completeVolumeDraftData(),
          },
          volumeWalletSelection: {
            volumeWalletPubkey: "VolumeWallet...5sTq",
          },
        },
        previewMode: "blocked-awaiting-smithii",
        mockMarkers: ["Mock Volume Bot started", "run_bot_volume"],
      },
      {
        name: "launch plus volume",
        request: {
          message:
            "launch a token called Blue Frog then start volume after 5 min with momentum template",
          launchWalletSelection: {
            devWalletPubkey: "DevWallet...91nP",
            bundleWallets: [
              { pubkey: "BndlWallet...4kd9", buyAmountSol: 0.3 },
              { pubkey: "BndlWallet...8qa2", buyAmountSol: 0.3 },
            ],
          },
          volumeWalletSelection: {
            volumeWalletPubkey: "BndlWallet...4kd9",
          },
        },
        previewMode: "blocked-awaiting-smithii",
        mockMarkers: ["Mock Bundle Launch executed", "Volume Bot queued"],
      },
    ] as const;

    for (const scenario of scenarios) {
      const previewResponse = await POST(jsonRequest(scenario.request));
      const preview = await responseJson(previewResponse);
      const cookie = cookieHeaderFrom(previewResponse);

      expect(previewResponse.status, scenario.name).toBe(200);
      expectNoPrivateKeyAliasFields(preview);
      expectNoRealExecutionClaim(preview);
      expect(preview.pendingPlan, scenario.name).toBeTruthy();
      expect(preview.smithiiLive).toMatchObject({
        mode: scenario.previewMode,
        serverExecution: "blocked",
      });

      const confirmResponse = await POST(
        jsonRequest(
          {
            message: "confirm",
            pendingPlan: preview.pendingPlan,
          },
          cookie,
        ),
      );
      const confirmed = await responseJson(confirmResponse);

      expect(confirmResponse.status, scenario.name).toBe(200);
      expectMockConfirmationSafety(confirmed, [...scenario.mockMarkers]);
    }
  });

  it("does not consume a pending plan on non-confirm draft requests", async () => {
    const previewResponse = await POST(
      jsonRequest({
        message: "no",
        draft: {
          tool: "bundle_launch",
          data: completeLaunchDraftData(),
        },
        launchWalletSelection: {
          devWalletPubkey: "DevWallet...91nP",
          bundleWallets: [{ pubkey: "BndlWallet...4kd9", buyAmountSol: 0.1 }],
        },
      }),
    );
    const preview = await responseJson(previewResponse);
    const cookie = cookieHeaderFrom(previewResponse);

    const draftResponse = await POST(
      jsonRequest(
        {
          message: "NEWTICKER",
          pendingPlan: preview.pendingPlan,
          draft: {
            tool: "bundle_launch",
            data: {
              tokenName: "Other Token",
            },
          },
        },
        cookie,
      ),
    );

    expect(draftResponse.status).toBe(200);
    expect(await responseJson(draftResponse)).toMatchObject({
      executionStatus: "Collecting launch fields",
    });

    const confirmResponse = await POST(
      jsonRequest(
        {
          message: "confirm",
          pendingPlan: preview.pendingPlan,
        },
        cookie,
      ),
    );

    expect(confirmResponse.status).toBe(200);
    expect(JSON.stringify(await responseJson(confirmResponse))).toContain(
      "Mock Bundle Launch executed",
    );
  });

  it("records expired confirmation attempts in the local audit log", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-30T00:00:00.000Z"));

    const previewResponse = await POST(
      jsonRequest({
        message: "no",
        draft: {
          tool: "bundle_launch",
          data: completeLaunchDraftData(),
        },
        launchWalletSelection: {
          devWalletPubkey: "DevWallet...91nP",
          bundleWallets: [{ pubkey: "BndlWallet...4kd9", buyAmountSol: 0.1 }],
        },
      }),
    );
    const preview = await responseJson(previewResponse);
    const cookie = cookieHeaderFrom(previewResponse);
    const sessionId = sessionIdFromCookie(cookie);

    vi.setSystemTime(new Date("2026-04-30T00:06:00.000Z"));

    const expiredResponse = await POST(
      jsonRequest(
        {
          message: "confirm",
          pendingPlan: preview.pendingPlan,
        },
        cookie,
      ),
    );

    expect(expiredResponse.status).toBe(410);
    expect(await responseJson(expiredResponse)).toMatchObject({
      executionStatus: "Preview expired",
      pendingPlan: null,
    });
    expect(auditRecordsForSession(sessionId)).toContainEqual(
      expect.objectContaining({
        event: "confirmation_expired",
        tool: "bundle_launch",
        planId: "plan_bundle_launch_1_0_10",
        outcome: "Preview expired",
      }),
    );
  });

  it.each([
    "mnemonic",
    "pk",
    "privKeys",
    "privateKeys",
    "private_key",
    "secretKey",
    "seedPhrase",
  ])(
    "rejects private-key alias field %s anywhere in the request body",
    async (fieldName) => {
      const response = await POST(
        jsonRequest({
          message: "no",
          nested: {
            [fieldName]: "PRIVATE_KEY_ALIAS_SHOULD_NOT_ECHO",
          },
        }),
      );

      expect(response.status).toBe(400);
      expect(JSON.stringify(await responseJson(response))).not.toContain(
        "PRIVATE_KEY_ALIAS_SHOULD_NOT_ECHO",
      );
    },
  );

  it("rate-limits execute confirmations per session", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-30T01:00:00.000Z"));

    const cookie = `smithii_agent_session=rate-limit-${Date.now()}`;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const previewResponse = await POST(
        jsonRequest(
          {
            message: "no",
            draft: {
              tool: "bundle_launch",
              data: completeLaunchDraftData(),
            },
            launchWalletSelection: {
              devWalletPubkey: "DevWallet...91nP",
              bundleWallets: [
                { pubkey: `BndlWallet...${attempt}`, buyAmountSol: 0.1 },
              ],
            },
          },
          cookie,
        ),
      );
      const preview = await responseJson(previewResponse);

      const confirmResponse = await POST(
        jsonRequest(
          {
            message: "confirm",
            pendingPlan: preview.pendingPlan,
          },
          cookie,
        ),
      );

      expect(confirmResponse.status).toBe(200);
    }

    const previewResponse = await POST(
      jsonRequest(
        {
          message: "no",
          draft: {
            tool: "bundle_launch",
            data: completeLaunchDraftData(),
          },
          launchWalletSelection: {
            devWalletPubkey: "DevWallet...91nP",
            bundleWallets: [{ pubkey: "BndlWallet...6", buyAmountSol: 0.1 }],
          },
        },
        cookie,
      ),
    );
    const preview = await responseJson(previewResponse);

    expect(previewResponse.status).toBe(200);
    expect(preview.pendingPlan).toBeTruthy();

    const limitedResponse = await POST(
      jsonRequest(
        {
          message: "confirm",
          pendingPlan: preview.pendingPlan,
        },
        cookie,
      ),
    );

    expect(limitedResponse.status).toBe(429);
    expect(limitedResponse.headers.get("Retry-After")).toBe("60");
    expect(await responseJson(limitedResponse)).toEqual({
      error: "Too many execute attempts. Try again later.",
    });
  });

  it("resets execute rate limit after the one-minute window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-30T02:00:00.000Z"));

    const cookie = `smithii_agent_session=rate-reset-${Date.now()}`;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const previewResponse = await POST(
        jsonRequest(
          {
            message: "no",
            draft: {
              tool: "bundle_launch",
              data: completeLaunchDraftData(),
            },
            launchWalletSelection: {
              devWalletPubkey: "DevWallet...91nP",
              bundleWallets: [
                { pubkey: `BndlWalletReset...${attempt}`, buyAmountSol: 0.1 },
              ],
            },
          },
          cookie,
        ),
      );
      const preview = await responseJson(previewResponse);

      expect(
        await POST(
          jsonRequest(
            {
              message: "confirm",
              pendingPlan: preview.pendingPlan,
            },
            cookie,
          ),
        ),
      ).toMatchObject({ status: 200 });
    }

    vi.setSystemTime(new Date("2026-04-30T02:01:00.000Z"));

    const previewResponse = await POST(
      jsonRequest(
        {
          message: "no",
          draft: {
            tool: "bundle_launch",
            data: completeLaunchDraftData(),
          },
          launchWalletSelection: {
            devWalletPubkey: "DevWallet...91nP",
            bundleWallets: [{ pubkey: "BndlWalletReset...6", buyAmountSol: 0.1 }],
          },
        },
        cookie,
      ),
    );
    const preview = await responseJson(previewResponse);

    const confirmResponse = await POST(
      jsonRequest(
        {
          message: "confirm",
          pendingPlan: preview.pendingPlan,
        },
        cookie,
      ),
    );

    expect(confirmResponse.status).toBe(200);
  });

  it("does not spend execute quota on confirm words without an active plan", async () => {
    const cookie = `smithii_agent_session=no-plan-confirm-${Date.now()}`;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const noPlanResponse = await POST(jsonRequest({ message: "yes" }, cookie));

      expect(noPlanResponse.status).toBe(200);
      expect(await responseJson(noPlanResponse)).toMatchObject({
        executionStatus: "Waiting for preview",
      });
    }

    const previewResponse = await POST(
      jsonRequest(
        {
          message: "no",
          draft: {
            tool: "bundle_launch",
            data: completeLaunchDraftData(),
          },
          launchWalletSelection: {
            devWalletPubkey: "DevWallet...91nP",
            bundleWallets: [{ pubkey: "BndlWallet...4kd9", buyAmountSol: 0.1 }],
          },
        },
        cookie,
      ),
    );
    const preview = await responseJson(previewResponse);

    const confirmResponse = await POST(
      jsonRequest(
        {
          message: "confirm",
          pendingPlan: preview.pendingPlan,
        },
        cookie,
      ),
    );

    expect(confirmResponse.status).toBe(200);
    expect(JSON.stringify(await responseJson(confirmResponse))).toContain(
      "Mock Bundle Launch executed",
    );
  });

  it("rejects pending plans with unknown tools", async () => {
    const response = await POST(
      jsonRequest({
        message: "confirm",
        pendingPlan: {
          id: "weird_plan",
          tool: "not_a_tool",
          createdAt: Date.now(),
          signature: "invalid",
        },
      }),
    );

    expect(response.status).toBe(400);
    expect(await responseJson(response)).toEqual({
      error: "Invalid pending plan.",
    });
  });
});

function cookieHeaderFrom(response: Response) {
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) {
    throw new Error("Expected response to set a session cookie.");
  }

  return setCookie.split(";")[0];
}

function sessionIdFromCookie(cookie: string) {
  return cookie.split("=")[1];
}

function planRecordPath(sessionId: string, planId: string) {
  const digest = createHash("sha256")
    .update(`${sessionId}:${planId}`)
    .digest("hex");
  return path.join(PLAN_RECORDS_DIR, `${digest}.json`);
}

function auditRecordsForSession(sessionId: string) {
  if (!existsSync(AUDIT_LOG_PATH)) {
    return [];
  }

  const content = readFileSync(AUDIT_LOG_PATH, "utf8").trim();
  if (!content) {
    return [];
  }

  const records = content.startsWith("[")
    ? (JSON.parse(content) as Array<Record<string, unknown>>)
    : content
        .split(/\r?\n/)
        .filter(Boolean)
        .flatMap((line) => {
          try {
            return [JSON.parse(line) as Record<string, unknown>];
          } catch {
            return [];
          }
        });

  return records.filter((record) => record.sessionId === sessionId);
}

function completeLaunchDraftData() {
  return {
    tokenName: "Leak Test",
    symbol: "LEAK",
    description: "Boundary test",
    walletCount: 1,
    solPerWallet: 0.1,
    imageFileName: "leak.png",
    socialsEnabled: false,
    cashbackCoin: false,
    useDifferentBlocks: true,
    pregenerateTokenAddress: false,
  };
}

function completeSwapDraftData() {
  return {
    direction: "token_to_sol",
    fromToken: "SCATMint111",
    toToken: "SOL",
    walletCount: 1,
    quantityMode: { type: "fixed", perTxSol: 0.2 },
    txCount: 2,
    txDelayBlocks: 1,
  };
}

function completeVolumeDraftData() {
  return {
    tokenAddress: "Mint111",
    makers: 200,
    orderAmount: { minSol: 0.01, maxSol: 0.02 },
    delaySeconds: { min: 10, max: 20 },
    onPurchase: "auto_sell",
    sellTiming: "after_each",
    sellMode: "sell_strategy",
    sellStrategy: {
      legs: [
        {
          sellPct: { min: 1, max: 33 },
          delaySeconds: { min: 10, max: 20 },
        },
      ],
    },
  };
}
