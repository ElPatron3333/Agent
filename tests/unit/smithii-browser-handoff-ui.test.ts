import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { ActivePreview, PendingPlan } from "../../src/lib/agent/mock-chat";
import type { SmithiiLiveBoundary } from "../../src/lib/smithii/live-boundary";
import { browserHandoffUiModel } from "../../src/lib/smithii/browser-handoff-ui";

const globalSettings = {
  speed: "fast",
  jitoTip: "default",
  mevProtection: true,
  slippagePct: 10,
} as const;

describe("Smithii browser handoff UI model", () => {
  it("returns a non-secret Bundle Launch handoff shell model", () => {
    const model = browserHandoffUiModel({
      activePreview: bundleLaunchPreview(),
      pendingPlan: pendingPlan("bundle_launch"),
      smithiiLive: boundary("browser-handoff-ready", "PumpFunClient.createAndSnipeToken"),
    });

    expect(model).toEqual({
      status: "Ready for browser handoff setup",
      flowLabel: "Bundle Launch",
      planId: "plan_bundle_launch_2_0_30",
      sdkMethod: "PumpFunClient.createAndSnipeToken",
      disabledActionLabel: "Browser handoff not wired",
      requiredMaterials: [
        "Token metadata image",
        "Generated mint keypair",
        "Connected dev wallet signer",
        "Browser-held bundle wallet material",
      ],
    });
    expect(JSON.stringify(model)).not.toMatch(secretLabelPattern);
  });

  it("returns a non-secret Bundle Swap handoff shell model", () => {
    const model = browserHandoffUiModel({
      activePreview: bundleSwapPreview("sol_to_token"),
      pendingPlan: pendingPlan("bundle_swap"),
      smithiiLive: boundary("browser-handoff-ready", "PumpFunClient.bundleSellBuy"),
    });

    expect(model).toEqual({
      status: "Ready for browser handoff setup",
      flowLabel: "Bundle Swap",
      planId: "plan_bundle_swap_sol_to_token_2_abc",
      sdkMethod: "PumpFunClient.bundleSellBuy",
      disabledActionLabel: "Browser handoff not wired",
      requiredMaterials: [
        "Token mint address",
        "Connected fee wallet signer",
        "Browser-held participating wallet material",
        "Per-wallet amounts",
      ],
    });
    expect(JSON.stringify(model)).not.toMatch(secretLabelPattern);
  });

  it("returns a non-secret token-to-SOL Bundle Swap handoff shell model", () => {
    const model = browserHandoffUiModel({
      activePreview: bundleSwapPreview("token_to_sol"),
      pendingPlan: pendingPlan("bundle_swap"),
      smithiiLive: boundary("browser-handoff-ready", "PumpFunClient.bundleSellBuy"),
    });

    expect(model).toMatchObject({
      status: "Ready for browser handoff setup",
      flowLabel: "Bundle Swap",
      planId: "plan_bundle_swap_sol_to_token_2_abc",
      sdkMethod: "PumpFunClient.bundleSellBuy",
      disabledActionLabel: "Browser handoff not wired",
    });
    expect(JSON.stringify(model)).not.toMatch(secretLabelPattern);
  });
  it.each([
    ["missing preview", null, pendingPlan("bundle_launch"), boundary("browser-handoff-ready", "PumpFunClient.createAndSnipeToken")],
    ["missing pending plan", bundleLaunchPreview(), null, boundary("browser-handoff-ready", "PumpFunClient.createAndSnipeToken")],
    ["mock boundary", bundleLaunchPreview(), pendingPlan("bundle_launch"), boundary("mock", "Mock: PumpFunClient.createAndSnipeToken")],
    ["token-to-token swap", bundleSwapPreview("token_to_token"), pendingPlan("bundle_swap"), boundary("blocked-awaiting-smithii", "PumpFunClient.bundleSellBuy")],
    ["volume bot", volumeBotPreview(), pendingPlan("volume_bot"), boundary("blocked-awaiting-smithii", "market_maker_bot_ HTTP endpoints")],
    ["launch plus volume", launchVolumeSequencePreview(), pendingPlan("launch_volume_sequence"), boundary("blocked-awaiting-smithii", "Composite: Bundle Launch + Volume Bot")],
  ])("returns null for %s", (_label, activePreview, pendingPlanValue, smithiiLive) => {
    expect(
      browserHandoffUiModel({
        activePreview,
        pendingPlan: pendingPlanValue,
        smithiiLive,
      }),
    ).toBeNull();
  });
  it("does not render a model when the pending plan tool does not match the preview", () => {
    expect(
      browserHandoffUiModel({
        activePreview: bundleLaunchPreview(),
        pendingPlan: pendingPlan("bundle_swap"),
        smithiiLive: boundary("browser-handoff-ready", "PumpFunClient.createAndSnipeToken"),
      }),
    ).toBeNull();
  });

  it("does not render a model when the pending plan id does not match the preview", () => {
    expect(
      browserHandoffUiModel({
        activePreview: bundleLaunchPreview(),
        pendingPlan: { ...pendingPlan("bundle_launch"), id: "plan_bundle_launch_other" },
        smithiiLive: boundary("browser-handoff-ready", "PumpFunClient.createAndSnipeToken"),
      }),
    ).toBeNull();
  });

  it("keeps the Pump browser executor out of app and component imports", () => {
    const offenders = filesUnder("src/app", "src/components").filter((filePath) =>
      readFileSync(filePath, "utf8").includes("pump-browser-executor"),
    );

    expect(offenders).toEqual([]);
  });
});

const secretLabelPattern = /\b(pk|privKeys|privateKey|privateKeys|secretKey|mnemonic|seedPhrase)\b/i;

function boundary(
  mode: SmithiiLiveBoundary["mode"],
  sdkMethod: string,
): SmithiiLiveBoundary {
  return {
    mode,
    serverExecution: "blocked",
    sdkPackage: "@smithii/sdk",
    sdkMethod,
    browserRequiredSignerArgs: ["bundle buyer signer material"],
    blockers: mode === "blocked-awaiting-smithii" ? ["Blocked"] : [],
    questionsForSmithii: [],
  };
}

function pendingPlan(tool: PendingPlan["tool"]): PendingPlan {
  return {
    id: tool === "bundle_launch"
      ? "plan_bundle_launch_2_0_30"
      : tool === "bundle_swap"
        ? "plan_bundle_swap_sol_to_token_2_abc"
        : tool === "volume_bot"
          ? "bot_volume_200_Mint111_abc"
          : "sequence_launch_volume_momentum_v1_5_abc",
    tool,
    createdAt: 1778054700000,
  };
}

function bundleLaunchPreview(): Extract<ActivePreview, { kind: "bundle_launch" }> {
  return {
    kind: "bundle_launch",
    planId: "plan_bundle_launch_2_0_30",
    token: "Blue Frog / BFROG",
    totalBuysSol: 0.3,
    serviceFeeSol: 0.1,
    devWalletFeesSol: 0.1,
    devWalletPubkey: "DevWallet...91nP",
    bundleWallets: [
      { pubkey: "wallet111", buyAmountSol: 0.1 },
      { pubkey: "wallet222", buyAmountSol: 0.2 },
    ],
    imageFileName: "blue-frog.png",
    socialsEnabled: false,
    socials: {},
    modifiers: {
      cashbackCoin: false,
      useDifferentBlocks: true,
      pregenerateTokenAddress: false,
    },
    globalSettings,
    summary: "Bundle launch for BFROG with 2 bundle wallets.",
  };
}

function bundleSwapPreview(
  direction: Extract<ActivePreview, { kind: "bundle_swap" }>["direction"],
): Extract<ActivePreview, { kind: "bundle_swap" }> {
  return {
    kind: "bundle_swap",
    planId: "plan_bundle_swap_sol_to_token_2_abc",
    direction,
    fromToken: direction === "sol_to_token" ? "SOL" : "Mint111",
    toToken: direction === "token_to_sol" ? "SOL" : "Mint222",
    routing: "pumpfun_bonding",
    serviceFeeSol: 0.1,
    walletCount: 2,
    readyWallets: 2,
    skippedWallets: 0,
    quantityModeLabel: "Fixed 0.1 SOL per tx",
    txCount: 2,
    txDelayBlocks: 1,
    estimatedIntervalS: 0.4,
    estimatedTotalS: 0.8,
    perTxOverrides: {},
    perWallet: [
      {
        pubkey: "wallet111",
        solBalance: 1,
        tokenBalance: 0,
        plannedAmountSolOrPct: 0.1,
        status: "ready",
      },
      {
        pubkey: "wallet222",
        solBalance: 1,
        tokenBalance: 0,
        plannedAmountSolOrPct: 0.1,
        status: "ready",
      },
    ],
    globalSettings,
    summary: "Bundle swap across 2 wallets.",
  };
}

function volumeBotPreview(): Extract<ActivePreview, { kind: "volume_bot" }> {
  return {
    kind: "volume_bot",
    botId: "bot_volume_200_Mint111_abc",
    tokenAddress: "Mint111",
    volumeWalletPubkey: "VolumeWallet...5sTq",
    makers: 200,
    orderAmount: { minSol: 0.01, maxSol: 0.02 },
    delaySeconds: { min: 10, max: 20 },
    onPurchase: "auto_sell",
    sellTiming: "after_each",
    sellMode: "sell_100",
    serviceFeeSol: 0.05,
    estimatedTotalFeesSol: 3.05,
    expectedDurationText: "200 makers, 10-20s delay",
    globalSettings,
    summary: "Volume bot for Mint111 with 200 makers.",
  };
}

function launchVolumeSequencePreview(): Extract<ActivePreview, { kind: "launch_volume_sequence" }> {
  return {
    kind: "launch_volume_sequence",
    sequenceId: "sequence_launch_volume_momentum_v1_5_abc",
    token: "Blue Frog / BFROG",
    templateId: "momentum_v1",
    templateName: "Momentum",
    delayMinutes: 5,
    launch: {
      bundleWalletCount: 2,
      totalBuysSol: 0.6,
      serviceFeeSol: 0.1,
    },
    volume: {
      volumeWalletPubkey: "VolumeWallet...5sTq",
      makers: 250,
      serviceFeeSol: 0.063,
      estimatedTotalFeesSol: 4.125,
    },
    globalSettings,
    summary: "Momentum sequence.",
  };
}
function filesUnder(...roots: string[]) {
  return roots.flatMap((root) => sourceFilesIn(root));
}

function sourceFilesIn(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      return sourceFilesIn(fullPath);
    }

    return /\.tsx?$/.test(fullPath) ? [fullPath] : [];
  });
}
