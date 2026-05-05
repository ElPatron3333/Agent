import { describe, expect, it } from "vitest";

import type { ActivePreview, PendingPlan } from "../../src/lib/agent/mock-chat";
import type { SmithiiLiveBoundary } from "../../src/lib/smithii/live-boundary";
import {
  bundleSwapBrowserExecutionSummary,
  prepareBundleSwapBrowserExecution,
} from "../../src/lib/smithii/bundle-swap-browser-wiring";
import { executePumpBundleSwapBrowserHandoff } from "../../src/lib/smithii/pump-browser-executor";
import type { BrowserWalletEntry } from "../../src/lib/wallet-roster";

const secretLabelPattern = /\b(pk|privKeys|privateKey|privateKeys|secretKey|mnemonic|seedPhrase)\b/i;
const secretValuePattern = /SECRET_SWAP_PK/i;

const globalSettings = {
  speed: "fast",
  jitoTip: "default",
  mevProtection: true,
  slippagePct: 10,
} as const;

describe("Smithii Bundle Swap browser wiring", () => {
  it("prepares a browser-local SOL-to-token swap packet with a non-secret public plan", () => {
    const prepared = prepareBundleSwapBrowserExecution({
      activePreview: bundleSwapPreview("sol_to_token", "11111111111111111111111111111111"),
      pendingPlan: pendingPlan("bundle_swap"),
      smithiiLive: boundary("browser-handoff-ready"),
      walletRoster: browserWalletRoster(),
      feeWalletPubkey: "FeeWallet111",
      nonce: "nonce-8f",
      now: new Date("2026-05-06T08:00:00.000Z"),
    });

    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") {
      throw new Error(prepared.reason);
    }

    expect(prepared.packet.plan.flow).toBe("bundle_swap");
    expect(prepared.packet.plan.wallet).toBe("FeeWallet111");
    expect(prepared.packet.plan.expectedFeesLamports).toBe("100000000");
    expect(prepared.packet.executorInput.direction).toBe("sol_to_token");
    expect(prepared.packet.executorInput.pool).toBe("pump");
    expect(prepared.packet.executorInput.privKeys).toEqual([
      "SECRET_SWAP_PK_1",
      "SECRET_SWAP_PK_2",
    ]);
    expect(prepared.packet.executorInput.amounts).toEqual([0.1, 0.2]);

    const summary = bundleSwapBrowserExecutionSummary(prepared.packet);
    expect(summary).toMatchObject({
      status: "Browser swap packet prepared",
      flow: "bundle_swap",
      planId: prepared.packet.plan.planId,
      action: "buy",
      pool: "pump",
      walletCount: 2,
      amountCount: 2,
      expectedFeesLamports: "100000000",
    });
    expect(JSON.stringify(prepared.packet.plan)).not.toMatch(secretLabelPattern);
    expect(JSON.stringify(prepared.packet.plan)).not.toMatch(secretValuePattern);
    expect(JSON.stringify(summary)).not.toMatch(secretLabelPattern);
    expect(JSON.stringify(summary)).not.toMatch(secretValuePattern);
  });

  it("prepares token-to-SOL packets that execute through the Pump browser executor sell action", async () => {
    const prepared = prepareBundleSwapBrowserExecution({
      activePreview: bundleSwapPreview("token_to_sol", "11111111111111111111111111111111"),
      pendingPlan: pendingPlan("bundle_swap"),
      smithiiLive: boundary("browser-handoff-ready"),
      walletRoster: browserWalletRoster(),
      feeWalletPubkey: "FeeWallet111",
      nonce: "nonce-8f-sell",
      now: new Date("2026-05-06T08:00:00.000Z"),
    });

    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") {
      throw new Error(prepared.reason);
    }

    const calls: unknown[] = [];
    const result = await executePumpBundleSwapBrowserHandoff(
      {
        uploadMetadata: async () => {
          throw new Error("unused");
        },
        createAndSnipeToken: async () => {
          throw new Error("unused");
        },
        bundleSellBuy: async (input) => {
          calls.push(input);
          return {
            bundleIds: ["bundle-sell"],
            txSignatures: ["tx-sell"],
            paymentSignature: "payment-sell",
          };
        },
      },
      prepared.packet.executorInput,
    );

    expect(calls).toMatchObject([
      {
        action: "sell",
        pool: "pump",
        privKeys: ["SECRET_SWAP_PK_1", "SECRET_SWAP_PK_2"],
        amounts: [0.1, 0.2],
      },
    ]);
    expect(result).toMatchObject({
      flow: "bundle_swap",
      action: "sell",
      bundleIds: ["bundle-sell"],
      txSignatures: ["tx-sell"],
      paymentSignature: "payment-sell",
    });
    expect(JSON.stringify(result)).not.toMatch(secretValuePattern);
  });

  it.each([
    ["missing preview", null, pendingPlan("bundle_swap"), boundary("browser-handoff-ready"), browserWalletRoster(), "Bundle Swap preview is required."],
    ["missing pending plan", bundleSwapPreview("sol_to_token", "11111111111111111111111111111111"), null, boundary("browser-handoff-ready"), browserWalletRoster(), "Bundle Swap pending plan is required."],
    ["mock boundary", bundleSwapPreview("sol_to_token", "11111111111111111111111111111111"), pendingPlan("bundle_swap"), boundary("mock"), browserWalletRoster(), "Smithii browser handoff is not ready for this swap."],
    ["token-to-token", bundleSwapPreview("token_to_token", "11111111111111111111111111111111"), pendingPlan("bundle_swap"), boundary("browser-handoff-ready"), browserWalletRoster(), "Token-to-token Bundle Swap is not supported by Pump browser execution."],
    ["mismatched plan", { ...bundleSwapPreview("sol_to_token", "11111111111111111111111111111111"), planId: "other_plan" }, pendingPlan("bundle_swap"), boundary("browser-handoff-ready"), browserWalletRoster(), "Bundle Swap preview and pending plan do not match."],
    ["invalid mint", bundleSwapPreview("sol_to_token", "not-a-mint"), pendingPlan("bundle_swap"), boundary("browser-handoff-ready"), browserWalletRoster(), "Bundle Swap token mint is invalid."],
    ["unsupported routing", { ...bundleSwapPreview("sol_to_token", "11111111111111111111111111111111"), routing: "unknown_pool" }, pendingPlan("bundle_swap"), boundary("browser-handoff-ready"), browserWalletRoster(), "Bundle Swap routing is not supported by Pump browser execution."],
    ["missing roster key", bundleSwapPreview("sol_to_token", "11111111111111111111111111111111"), pendingPlan("bundle_swap"), boundary("browser-handoff-ready"), browserWalletRoster().slice(0, 1), "Browser wallet material is missing for wallet222."],
  ])(
    "blocks packet preparation for %s",
    (_label, activePreview, pendingPlanValue, smithiiLive, walletRoster, reason) => {
      const prepared = prepareBundleSwapBrowserExecution({
        activePreview,
        pendingPlan: pendingPlanValue,
        smithiiLive,
        walletRoster,
        feeWalletPubkey: "FeeWallet111",
        nonce: "nonce-8f",
        now: new Date("2026-05-06T08:00:00.000Z"),
      });

      expect(prepared).toEqual({ status: "blocked", reason });
    },
  );

  it("blocks when no preview wallets are ready", () => {
    const preview = {
      ...bundleSwapPreview("sol_to_token", "11111111111111111111111111111111"),
      readyWallets: 0,
      skippedWallets: 2,
      perWallet: bundleSwapPreview("sol_to_token", "11111111111111111111111111111111").perWallet.map((wallet) => ({
        ...wallet,
        status: "skip_no_token" as const,
      })),
    };

    expect(
      prepareBundleSwapBrowserExecution({
        activePreview: preview,
        pendingPlan: pendingPlan("bundle_swap"),
        smithiiLive: boundary("browser-handoff-ready"),
        walletRoster: browserWalletRoster(),
        feeWalletPubkey: "FeeWallet111",
        nonce: "nonce-8f",
        now: new Date("2026-05-06T08:00:00.000Z"),
      }),
    ).toEqual({
      status: "blocked",
      reason: "Bundle Swap has no ready wallets to execute.",
    });
  });
});

function boundary(mode: SmithiiLiveBoundary["mode"]): SmithiiLiveBoundary {
  return {
    mode,
    serverExecution: "blocked",
    sdkPackage: "@smithii/sdk",
    sdkMethod: "PumpFunClient.bundleSellBuy",
    browserRequiredSignerArgs: ["bundle swap wallet signer material"],
    blockers: [],
    questionsForSmithii: [],
  };
}

function pendingPlan(tool: PendingPlan["tool"]): PendingPlan {
  return {
    id: tool === "bundle_swap" ? "plan_bundle_swap_2_abc" : "plan_bundle_launch_2_abc",
    tool,
    createdAt: 1778054700000,
  };
}

function browserWalletRoster(): BrowserWalletEntry[] {
  return [
    {
      id: "bundle-1",
      pubkey: "wallet111",
      privateKey: "SECRET_SWAP_PK_1",
      solBalance: 1,
      tokenBalance: 100,
      pctOfSupply: 0,
      role: "bundle",
    },
    {
      id: "bundle-2",
      pubkey: "wallet222",
      privateKey: "SECRET_SWAP_PK_2",
      solBalance: 1,
      tokenBalance: 200,
      pctOfSupply: 0,
      role: "bundle",
    },
  ];
}

function bundleSwapPreview(
  direction: Extract<ActivePreview, { kind: "bundle_swap" }>["direction"],
  mint: string,
): Extract<ActivePreview, { kind: "bundle_swap" }> {
  return {
    kind: "bundle_swap",
    planId: "plan_bundle_swap_2_abc",
    direction,
    fromToken: direction === "sol_to_token" ? "SOL" : mint,
    toToken: direction === "token_to_sol" ? "SOL" : mint,
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
        tokenBalance: 100,
        plannedAmountSolOrPct: 0.1,
        status: "ready",
      },
      {
        pubkey: "wallet222",
        solBalance: 1,
        tokenBalance: 200,
        plannedAmountSolOrPct: 0.2,
        status: "ready",
      },
    ],
    globalSettings,
    summary: "Bundle swap across 2 wallets.",
  };
}