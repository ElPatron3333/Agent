import { describe, expect, it } from "vitest";

import {
  chatErrorStateForResponse,
  inputForLastConfig,
  nextActivePreview,
  nextPreviewLiveState,
} from "../../src/lib/agent/client-chat-state";
import type { ActivePreview, MockChatResult } from "../../src/lib/agent/mock-chat";

describe("client chat state transitions", () => {
  it("clears the active preview while a new draft is being collected", () => {
    const previousPreview = bundleLaunchPreview();

    const result: MockChatResult = {
      assistantMessage: { role: "assistant", text: "What token name should I use?" },
      pendingPlan: null,
      activePreview: null,
      executionStatus: "Collecting launch fields",
      draft: { tool: "bundle_launch", data: {} },
    };

    expect(nextActivePreview(result, previousPreview)).toBeNull();
  });

  it("keeps a previous preview only for non-terminal responses without a draft", () => {
    const previousPreview = bundleLaunchPreview();

    const result: MockChatResult = {
      assistantMessage: {
        role: "assistant",
        text: "I can prepare a Bundle Launch, Bundle Swap, or Volume Bot preview.",
      },
      pendingPlan: null,
      activePreview: null,
      executionStatus: "Waiting for preview",
      draft: null,
    };

    expect(nextActivePreview(result, previousPreview)).toBe(previousPreview);
  });

  it("clears pending preview state after an invalid pending plan response", () => {
    expect(chatErrorStateForResponse("Invalid pending plan.")).toEqual({
      message: "Invalid pending plan.",
      clearPendingPlan: true,
      clearActivePreview: true,
      executionStatus: "Invalid preview",
    });
  });

  it("clears pending preview state after a preview expired response", () => {
    expect(chatErrorStateForResponse("Preview expired")).toEqual({
      message: "Preview expired",
      clearPendingPlan: true,
      clearActivePreview: true,
      executionStatus: "Preview expired",
    });
  });
  it("clears the active preview after a launch to volume sequence is queued", () => {
    const previousPreview = bundleLaunchPreview();

    const result: MockChatResult = {
      assistantMessage: {
        role: "assistant",
        text: "Mock Bundle Launch executed. Volume Bot queued for 5 minutes later.",
      },
      pendingPlan: null,
      activePreview: null,
      executionStatus: "Launch + Volume sequence queued",
      draft: null,
    };

    expect(nextActivePreview(result, previousPreview)).toBeNull();
  });

  it("keeps retained previews paired with their previous Smithii live state", () => {
    const previousPreview = bundleLaunchPreview();
    const previousLive = smithiiBoundary("browser-handoff-ready");

    const result: MockChatResult = {
      assistantMessage: {
        role: "assistant",
        text: "I can prepare a Bundle Launch, Bundle Swap, or Volume Bot preview.",
      },
      pendingPlan: null,
      activePreview: null,
      executionStatus: "Waiting for preview",
      draft: null,
    };

    expect(
      nextPreviewLiveState(result, {
        activePreview: previousPreview,
        smithiiLive: previousLive,
      }),
    ).toEqual({
      activePreview: previousPreview,
      smithiiLive: previousLive,
    });
  });

  it("clears Smithii live state when the preview is cleared", () => {
    const previousPreview = bundleLaunchPreview();
    const previousLive = smithiiBoundary("browser-handoff-ready");

    const result: MockChatResult = {
      assistantMessage: {
        role: "assistant",
        text: "Mock Bundle Launch executed.",
      },
      pendingPlan: null,
      activePreview: null,
      executionStatus: "Mint11111111... returned",
      draft: null,
    };

    expect(
      nextPreviewLiveState(result, {
        activePreview: previousPreview,
        smithiiLive: previousLive,
      }),
    ).toEqual({
      activePreview: null,
      smithiiLive: null,
    });
  });

  it("builds a reusable input from the saved launch to volume config", () => {
    expect(
      inputForLastConfig({
        kind: "launch_volume_sequence",
        label: "Launch + Volume: Blue Frog / BFROG",
        templateId: "momentum_v1",
        updatedAt: "2026-04-30T20:00:00.000Z",
      }),
    ).toBe("launch a token called Blue Frog then start volume after 5 min with momentum template");
  });
});

function bundleLaunchPreview(): ActivePreview {
  return {
    kind: "bundle_launch",
    planId: "plan_bundle_launch_1_0_10",
    token: "Leak Test / LEAK",
    totalBuysSol: 0.1,
    serviceFeeSol: 0.1,
    devWalletFeesSol: 0.1,
    devWalletPubkey: "DevWallet...91nP",
    bundleWallets: [{ pubkey: "BndlWallet...4kd9", buyAmountSol: 0.1 }],
    imageFileName: "leak.png",
    socialsEnabled: false,
    socials: {},
    modifiers: {
      cashbackCoin: false,
      useDifferentBlocks: true,
      pregenerateTokenAddress: false,
    },
    globalSettings: {
      speed: "fast",
      jitoTip: "default",
      mevProtection: true,
      slippagePct: 10,
    },
    summary: "Bundle launch for LEAK with 1 bundle wallets.",
  };
}

function smithiiBoundary(mode: "mock" | "browser-handoff-ready" | "blocked-awaiting-smithii") {
  return {
    mode,
    serverExecution: "blocked" as const,
    sdkPackage: "@smithii/sdk" as const,
    sdkMethod: "PumpFunClient.createAndSnipeToken",
    browserRequiredSignerArgs: ["bundle buyer signer material"],
    blockers: [],
    questionsForSmithii: [],
  };
}
