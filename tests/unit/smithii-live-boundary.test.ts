import { describe, expect, it } from "vitest";

import type { ActivePreview } from "../../src/lib/agent/mock-chat";
import {
  liveBoundaryForPreview,
  requireServerLiveExecutionBlocked,
} from "../../src/lib/smithii/live-boundary";

const globalSettings = {
  speed: "fast",
  jitoTip: "default",
  mevProtection: true,
  slippagePct: 10,
} as const;

describe("Smithii Phase 8A live boundary", () => {
  it("marks bundle launch as browser handoff ready but not server executable", () => {
    const boundary = liveBoundaryForPreview(bundleLaunchPreview());

    expect(boundary.mode).toBe("browser-handoff-ready");
    expect(boundary.serverExecution).toBe("blocked");
    expect(boundary.sdkMethod).toBe("PumpFunClient.createAndSnipeToken");
    expect(boundary.browserRequiredSignerArgs).toContain("bundle buyer signer material");
    expect(boundary.blockers).toEqual([]);
    expect(boundary.questionsForSmithii).toEqual([]);
    expect(JSON.stringify(boundary)).not.toMatch(/buyers\[\]\.pk|privKeys\[\]/);
  });

  it("marks SOL/token bundle swaps as browser handoff ready", () => {
    const boundary = liveBoundaryForPreview(bundleSwapPreview());

    expect(boundary.mode).toBe("browser-handoff-ready");
    expect(boundary.sdkMethod).toBe("PumpFunClient.bundleSellBuy");
    expect(boundary.browserRequiredSignerArgs).toContain("bundle swap wallet signer material");
    expect(boundary.blockers).toEqual([]);
    expect(boundary.questionsForSmithii).toEqual([]);
    expect(JSON.stringify(boundary)).not.toMatch(/buyers\[\]\.pk|privKeys\[\]/);
  });

  it("marks token-to-SOL bundle swaps as browser handoff ready", () => {
    const boundary = liveBoundaryForPreview({
      ...bundleSwapPreview(),
      direction: "token_to_sol",
      fromToken: "Mint111",
      toToken: "SOL",
    });

    expect(boundary.mode).toBe("browser-handoff-ready");
    expect(boundary.sdkMethod).toBe("PumpFunClient.bundleSellBuy");
    expect(boundary.blockers).toEqual([]);
    expect(boundary.questionsForSmithii).toEqual([]);
  });
  it("blocks token-to-token bundle swap live handoff", () => {
    const boundary = liveBoundaryForPreview({
      ...bundleSwapPreview(),
      direction: "token_to_token",
      fromToken: "SourceMint111",
      toToken: "TargetMint222",
    });

    expect(boundary.mode).toBe("blocked-awaiting-smithii");
    expect(boundary.serverExecution).toBe("blocked");
    expect(boundary.blockers).toContain(
      "@smithii/sdk/pump bundleSellBuy does not expose token-to-token swaps.",
    );
  });

  it("keeps classic Volume Bot blocked because Smithii confirmed it is backend-keyed", () => {
    const boundary = liveBoundaryForPreview(volumeBotPreview());

    expect(boundary.mode).toBe("blocked-awaiting-smithii");
    expect(boundary.sdkMethod).toBe("market_maker_bot_ HTTP endpoints");
    expect(boundary.blockers).toContain(
      "Classic Volume Bot is backend-keyed and cannot satisfy the zero-custody requirement for this integration.",
    );
    expect(boundary.questionsForSmithii).toEqual([]);
  });

  it("keeps launch plus volume sequences blocked until every child flow is live-ready", () => {
    const boundary = liveBoundaryForPreview(launchVolumeSequencePreview());

    expect(boundary.mode).toBe("blocked-awaiting-smithii");
    expect(boundary.sdkMethod).toBe("Composite: Bundle Launch + Volume Bot");
    expect(boundary.blockers).toContain(
      "Launch + Volume cannot be automated live because Smithii confirmed no launch-to-volume scheduler contract and Volume Bot is backend-keyed.",
    );
  });

  it("throws if server code tries to enable live Smithii execution", () => {
    expect(() => requireServerLiveExecutionBlocked("bundle_launch")).toThrow(
      "Live Smithii execution must not run on the backend",
    );
  });
});

function bundleLaunchPreview(): Extract<ActivePreview, { kind: "bundle_launch" }> {
  return {
    kind: "bundle_launch",
    planId: "plan_bundle_launch_2_0_30",
    token: "Blue Frog / BFROG",
    tokenName: "Blue Frog",
    tokenSymbol: "BFROG",
    description: "A blue frog community token.",
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

function bundleSwapPreview(): Extract<ActivePreview, { kind: "bundle_swap" }> {
  return {
    kind: "bundle_swap",
    planId: "plan_bundle_swap_sol_to_token_2_abc",
    direction: "sol_to_token",
    fromToken: "SOL",
    toToken: "Mint111",
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
    summary: "Bundle swap SOL to Mint111 across 2 wallets via pumpfun_bonding.",
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
    sellMode: "sell_strategy",
    sellStrategy: {
      legs: [
        {
          sellPct: { min: 1, max: 33 },
          delaySeconds: { min: 10, max: 20 },
        },
      ],
    },
    serviceFeeSol: 0.05,
    estimatedTotalFeesSol: 3.05,
    expectedDurationText: "200 makers, 10-20s delay",
    globalSettings,
    summary: "Volume bot for Mint111 with 200 makers.",
  };
}

function launchVolumeSequencePreview(): Extract<
  ActivePreview,
  { kind: "launch_volume_sequence" }
> {
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
    summary: "Momentum sequence: launch first, then queue Volume Bot after 5 minutes.",
  };
}
