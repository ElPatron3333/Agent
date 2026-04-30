import { describe, expect, it } from "vitest";

import {
  prepareBundleLaunch,
  prepareBundleSwap,
  prepareVolumeBot,
  executeBundleLaunch,
  executeBundleSwap,
  executeVolumeBot,
} from "../../src/lib/smithii/mock";
import type { VolumeBotInput } from "../../src/lib/smithii/types";

const globalSettings = {
  speed: "fast" as const,
  jitoTip: "default" as const,
  mevProtection: true,
  slippagePct: 10,
};

describe("mock Smithii tools", () => {
  it("prepares a bundle launch preview with Smithii fees and wallet buffers", () => {
    const preview = prepareBundleLaunch({
      dex: "pumpfun",
      token: {
        name: "Pepe 2026",
        symbol: "PEPE26",
        description: "First community token on Solana",
        imageFileName: "pepe.png",
        socialsEnabled: false,
      },
      modifiers: {
        cashbackCoin: false,
        useDifferentBlocks: true,
        pregenerateTokenAddress: true,
      },
      devWalletPubkey: "dev111",
      bundleWallets: [
        { pubkey: "wallet111", buyAmountSol: 0.5 },
        { pubkey: "wallet222", buyAmountSol: 0.75 },
      ],
      globalSettings,
    });

    expect(preview.planId).toBe("plan_bundle_launch_2_1_125");
    expect(preview.preview.smithiiServiceFeeSol).toBe(0.1);
    expect(preview.preview.pregenerateFeeSol).toBe(0.1);
    expect(preview.preview.totalBuysSol).toBe(1.25);
    expect(preview.preview.feesFromDevWalletSol).toBe(0.2);
    expect(preview.preview.perWalletMinBalance).toEqual([
      { pubkey: "wallet111", buySol: 0.5, recommendedBalanceSol: 0.55 },
      { pubkey: "wallet222", buySol: 0.75, recommendedBalanceSol: 0.8 },
    ]);
  });

  it("rejects bundle launch previews above the 16 wallet cap", () => {
    const wallets = Array.from({ length: 16 }, (_, index) => ({
      pubkey: `wallet${index}`,
      buyAmountSol: 0.1,
    }));

    expect(() =>
      prepareBundleLaunch({
        dex: "pumpfun",
        token: {
          name: "Too Many",
          symbol: "MANY",
          description: "Wallet cap test",
          imageFileName: "many.png",
          socialsEnabled: false,
        },
        modifiers: {
          cashbackCoin: false,
          useDifferentBlocks: false,
          pregenerateTokenAddress: false,
        },
        devWalletPubkey: "dev111",
        bundleWallets: wallets,
        globalSettings,
      }),
    ).toThrow("Bundle Launch supports 16 wallets total, including the dev wallet.");
  });

  it("prepares bundle swap and marks empty token wallets as skipped", () => {
    const preview = prepareBundleSwap({
      direction: "token_to_sol",
      fromToken: "Mint111",
      toToken: "SOL",
      participatingWallets: [
        { pubkey: "wallet111", solBalance: 0.05, tokenBalance: 20 },
        { pubkey: "wallet222", solBalance: 0.04, tokenBalance: 0 },
      ],
      quantityMode: { type: "random_pct", minPct: 80, maxPct: 100 },
      txCount: 2,
      txDelayBlocks: 1,
      globalSettings,
    });

    expect(preview.planId).toMatch(/^plan_bundle_swap_token_to_sol_2_[a-z0-9]+$/);
    expect(preview.preview.serviceFeeSol).toBe(0.1);
    expect(preview.preview.routing).toBe("pumpfun_bonding");
    expect(preview.preview.perWallet).toEqual([
      {
        pubkey: "wallet111",
        solBalance: 0.05,
        tokenBalance: 20,
        plannedAmountSolOrPct: 80,
        status: "ready",
      },
      {
        pubkey: "wallet222",
        solBalance: 0.04,
        tokenBalance: 0,
        plannedAmountSolOrPct: 80,
        status: "skip_no_token",
      },
    ]);
  });

  it("prepares bundle swap with routing, total sizing, fee skips, and per-tx overrides", () => {
    const preview = prepareBundleSwap({
      direction: "sol_to_token",
      fromToken: "SOL",
      toToken: "MigratedMint111",
      participatingWallets: [
        { pubkey: "wallet111", solBalance: 1, tokenBalance: 0 },
        { pubkey: "wallet222", solBalance: 0.01, tokenBalance: 0 },
        { pubkey: "wallet333", solBalance: 1, tokenBalance: 0 },
      ],
      quantityMode: { type: "total", totalSol: 1.5 },
      txCount: 3,
      txDelayBlocks: 2,
      perTxOverrides: {
        slippagePct: 7,
        gas: 0.00001,
        priority: 0.0002,
        mevShield: false,
      },
      globalSettings,
    });

    expect(preview.preview.routing).toBe("pumpswap_amm");
    expect(preview.preview.estimatedIntervalS).toBe(0.8);
    expect(preview.preview.estimatedTotalS).toBe(2.4);
    expect(preview.preview.perTxOverrides).toEqual({
      slippagePct: 7,
      gas: 0.00001,
      priority: 0.0002,
      mevShield: false,
    });
    expect(preview.preview.perWallet).toEqual([
      {
        pubkey: "wallet111",
        solBalance: 1,
        tokenBalance: 0,
        plannedAmountSolOrPct: 0.5,
        status: "ready",
      },
      {
        pubkey: "wallet222",
        solBalance: 0.01,
        tokenBalance: 0,
        plannedAmountSolOrPct: 0.5,
        status: "skip_no_sol_for_fees",
      },
      {
        pubkey: "wallet333",
        solBalance: 1,
        tokenBalance: 0,
        plannedAmountSolOrPct: 0.5,
        status: "ready",
      },
    ]);
  });

  it("marks buy wallets without planned SOL plus fee buffer as skipped", () => {
    const preview = prepareBundleSwap({
      direction: "sol_to_token",
      fromToken: "SOL",
      toToken: "Mint111",
      participatingWallets: [
        { pubkey: "wallet111", solBalance: 0.6, tokenBalance: 0 },
        { pubkey: "wallet222", solBalance: 0.52, tokenBalance: 0 },
      ],
      quantityMode: { type: "fixed", perTxSol: 0.5 },
      txCount: 2,
      txDelayBlocks: 1,
      globalSettings,
    });

    expect(preview.preview.perWallet.map((wallet) => wallet.status)).toEqual([
      "ready",
      "skip_no_sol_for_fees",
    ]);
  });

  it("uses distinct plan IDs for materially different bundle swaps", () => {
    const first = prepareBundleSwap({
      direction: "token_to_sol",
      fromToken: "Mint111",
      toToken: "SOL",
      participatingWallets: [
        { pubkey: "wallet111", solBalance: 1, tokenBalance: 20 },
        { pubkey: "wallet222", solBalance: 1, tokenBalance: 20 },
      ],
      quantityMode: { type: "fixed", perTxSol: 0.1 },
      txCount: 2,
      txDelayBlocks: 1,
      globalSettings,
    });
    const second = prepareBundleSwap({
      direction: "token_to_sol",
      fromToken: "OtherMint111",
      toToken: "SOL",
      participatingWallets: [
        { pubkey: "wallet111", solBalance: 1, tokenBalance: 20 },
        { pubkey: "wallet222", solBalance: 1, tokenBalance: 20 },
      ],
      quantityMode: { type: "fixed", perTxSol: 0.2 },
      txCount: 2,
      txDelayBlocks: 1,
      globalSettings,
    });

    expect(first.planId).not.toBe(second.planId);
    expect(first.planId).toMatch(/^plan_bundle_swap_token_to_sol_2_[a-z0-9]+$/);
  });

  it("prepares token-to-token bundle swaps", () => {
    const preview = prepareBundleSwap({
      direction: "token_to_token",
      fromToken: "SourceMint111",
      toToken: "MigratedMint111",
      participatingWallets: [
        { pubkey: "wallet111", solBalance: 1, tokenBalance: 20 },
        { pubkey: "wallet222", solBalance: 1, tokenBalance: 0 },
      ],
      quantityMode: { type: "random_pct", minPct: 25, maxPct: 50 },
      txCount: 2,
      txDelayBlocks: 1,
      globalSettings,
    });

    expect(preview.preview.routing).toBe("pumpfun_bonding");
    expect(preview.preview.perWallet.map((wallet) => wallet.status)).toEqual([
      "ready",
      "skip_no_token",
    ]);
  });

  it("prepares volume bot fees from maker count", () => {
    const preview = prepareVolumeBot({
      volumeWalletPubkey: "wallet111",
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
      globalSettings,
    });

    expect(preview.botId).toBe("bot_volume_200_Mint111");
    expect(preview.preview.smithiiServiceFeeSol).toBe(0.05);
    expect(preview.preview.estimatedTotalFeesSol).toBe(3.05);
  });

  it("rejects sell strategy volume bots without strategy legs", () => {
    const input = {
      volumeWalletPubkey: "wallet111",
      tokenAddress: "Mint111",
      makers: 100,
      orderAmount: { minSol: 0.01, maxSol: 0.02 },
      delaySeconds: { min: 10, max: 20 },
      onPurchase: "auto_sell",
      sellTiming: "after_each",
      sellMode: "sell_strategy",
      globalSettings,
    } as VolumeBotInput;

    expect(() => prepareVolumeBot(input)).toThrow(
      "Sell strategy is required when sell mode is sell_strategy.",
    );
  });

  it("returns deterministic fake execution results without private keys", () => {
    expect(executeBundleLaunch({ planId: "plan_bundle_launch_2_1_125" })).toEqual({
      mintAddress: "MockMint1111111111111111111111111111111111",
      txSignature: "MockBundleLaunchSignature_plan_bundle_launch_2_1_125",
    });
    expect(executeBundleSwap({ planId: "plan_bundle_swap_token_to_sol_2_abc" })).toEqual({
      txSignature: "MockBundleSwapSignature_plan_bundle_swap_token_to_sol_2_abc",
      perWalletResults: [],
    });
    expect(executeVolumeBot({ botId: "bot_volume_200_Mint111" })).toEqual({
      runId: "run_bot_volume_200_Mint111",
      status: "started",
    });
  });
});
