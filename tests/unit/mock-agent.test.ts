import { describe, expect, it } from "vitest";

import { handleMockChat } from "../../src/lib/agent/mock-chat";

const now = Date.parse("2026-04-29T00:00:00.000Z");

describe("mock chat agent", () => {
  it("starts a bundle launch draft and asks for the token name first", () => {
    const result = handleMockChat({
      message: "launch a token",
      now,
    });

    expect(result.assistantMessage.text).toBe("What token name should I use?");
    expect(result.draft).toEqual({
      tool: "bundle_launch",
      data: {},
    });
    expect(result.pendingPlan).toBeNull();
    expect(result.activePreview).toBeNull();
    expect(result.executionStatus).toBe("Collecting launch fields");
  });

  it("prefills launch draft fields from a natural-language launch request", () => {
    const result = handleMockChat({
      message: "launch a token called Blue Frog with a 5-wallet bundle",
      now,
    });

    expect(result.assistantMessage.text).toBe("What symbol should I use?");
    expect(result.draft).toEqual({
      tool: "bundle_launch",
      data: {
        tokenName: "Blue Frog",
        walletCount: 5,
      },
    });
    expect(result.pendingPlan).toBeNull();
    expect(result.activePreview).toBeNull();
    expect(result.executionStatus).toBe("Collecting launch fields");
  });

  it("keeps prefilled wallet count through the full launch preview flow", () => {
    const started = handleMockChat({
      message: "launch a token called Blue Frog with a 5-wallet bundle",
      now,
    });
    const symbol = handleMockChat({
      message: "BFROG",
      now,
      draft: started.draft,
    });
    const description = handleMockChat({
      message: "A blue frog community token.",
      now,
      draft: symbol.draft,
    });
    const solAmount = handleMockChat({
      message: "0.1",
      now,
      draft: description.draft,
    });
    const image = handleMockChat({
      message: "blue-frog.png",
      now,
      draft: solAmount.draft,
    });
    const socials = handleMockChat({
      message: "no",
      now,
      draft: image.draft,
    });
    const cashback = handleMockChat({
      message: "no",
      now,
      draft: socials.draft,
    });
    const differentBlocks = handleMockChat({
      message: "yes",
      now,
      draft: cashback.draft,
    });
    const preview = handleMockChat({
      message: "no",
      now,
      draft: differentBlocks.draft,
    });

    expect(preview.pendingPlan?.tool).toBe("bundle_launch");
    expect(preview.activePreview?.kind).toBe("bundle_launch");
    expect(
      preview.activePreview?.kind === "bundle_launch"
        ? preview.activePreview.bundleWallets
        : [],
    ).toHaveLength(5);
  });

  it("does not truncate token names that contain delimiter words", () => {
    const withName = handleMockChat({
      message: "launch a token called Built With Love with a 2-wallet bundle",
      now,
    });
    const forName = handleMockChat({
      message: "launch a token named Tokens for Friends with a 2-wallet bundle",
      now,
    });

    expect(withName.draft?.data).toMatchObject({
      tokenName: "Built With Love",
      walletCount: 2,
    });
    expect(forName.draft?.data).toMatchObject({
      tokenName: "Tokens for Friends",
      walletCount: 2,
    });
  });

  it("collects bundle launch fields one at a time before preparing a preview", () => {
    const named = handleMockChat({
      message: "Blue Frog",
      now,
      draft: { tool: "bundle_launch", data: {} },
    });
    expect(named.assistantMessage.text).toBe("What symbol should I use?");
    expect(named.draft?.data).toEqual({ tokenName: "Blue Frog" });

    const symbol = handleMockChat({
      message: "BFROG",
      now,
      draft: named.draft,
    });
    expect(symbol.assistantMessage.text).toBe(
      "Write a short description for the token.",
    );
    expect(symbol.draft?.data).toEqual({
      tokenName: "Blue Frog",
      symbol: "BFROG",
    });

    const described = handleMockChat({
      message: "A blue frog community token.",
      now,
      draft: symbol.draft,
    });
    expect(described.assistantMessage.text).toBe(
      "How many bundle wallets should buy? Use 1-15.",
    );
    expect(described.draft?.data.description).toBe(
      "A blue frog community token.",
    );

    const walletCount = handleMockChat({
      message: "3",
      now,
      draft: described.draft,
    });
    expect(walletCount.assistantMessage.text).toBe(
      "How much SOL should each bundle wallet buy?",
    );
    expect(walletCount.draft?.data.walletCount).toBe(3);

    const solAmount = handleMockChat({
      message: "0.5",
      now,
      draft: walletCount.draft,
    });
    expect(solAmount.assistantMessage.text).toBe(
      "What image filename should I use? Use a .png or .jpg placeholder.",
    );
    expect(solAmount.draft?.data.solPerWallet).toBe(0.5);

    const image = handleMockChat({
      message: "blue-frog.png",
      now,
      draft: solAmount.draft,
    });
    expect(image.assistantMessage.text).toBe(
      "Add socials? Reply yes or no.",
    );
    expect(image.draft?.data.imageFileName).toBe("blue-frog.png");

    const socialsToggle = handleMockChat({
      message: "yes",
      now,
      draft: image.draft,
    });
    expect(socialsToggle.assistantMessage.text).toBe(
      "Website URL? Reply skip if none.",
    );
    expect(socialsToggle.draft?.data.socialsEnabled).toBe(true);

    const website = handleMockChat({
      message: "https://bluefrog.example",
      now,
      draft: socialsToggle.draft,
    });
    expect(website.assistantMessage.text).toBe(
      "Telegram URL? Reply skip if none.",
    );

    const telegram = handleMockChat({
      message: "skip",
      now,
      draft: website.draft,
    });
    expect(telegram.assistantMessage.text).toBe(
      "Twitter/X URL? Reply skip if none.",
    );

    const twitter = handleMockChat({
      message: "https://x.com/bluefrog",
      now,
      draft: telegram.draft,
    });
    expect(twitter.assistantMessage.text).toBe(
      "Enable Cashback Coin? Reply yes or no.",
    );

    const cashback = handleMockChat({
      message: "no",
      now,
      draft: twitter.draft,
    });
    expect(cashback.assistantMessage.text).toBe(
      "Use different blocks? Reply yes or no.",
    );

    const differentBlocks = handleMockChat({
      message: "yes",
      now,
      draft: cashback.draft,
    });
    expect(differentBlocks.assistantMessage.text).toBe(
      "Pregenerate token address? Reply yes or no.",
    );

    const preview = handleMockChat({
      message: "yes",
      now,
      draft: differentBlocks.draft,
    });
    expect(preview.assistantMessage.text).toContain("Bundle Launch preview");
    expect(preview.draft).toBeNull();
    expect(preview.pendingPlan?.tool).toBe("bundle_launch");
    expect(preview.activePreview).toEqual({
      kind: "bundle_launch",
      planId: "plan_bundle_launch_3_1_150",
      token: "Blue Frog / BFROG",
      totalBuysSol: 1.5,
      serviceFeeSol: 0.1,
      devWalletFeesSol: 0.2,
      devWalletPubkey: "DevWallet...91nP",
      bundleWallets: [
        { pubkey: "BndlWallet...1", buyAmountSol: 0.5 },
        { pubkey: "BndlWallet...2", buyAmountSol: 0.5 },
        { pubkey: "BndlWallet...3", buyAmountSol: 0.5 },
      ],
      imageFileName: "blue-frog.png",
      socialsEnabled: true,
      socials: {
        website: "https://bluefrog.example",
        twitter: "https://x.com/bluefrog",
      },
      modifiers: {
        cashbackCoin: false,
        useDifferentBlocks: true,
        pregenerateTokenAddress: true,
      },
      globalSettings: {
        speed: "fast",
        jitoTip: "default",
        mevProtection: true,
        slippagePct: 10,
      },
      summary: "Bundle launch for BFROG with 3 bundle wallets.",
    });
  });

  it("uses supplied global settings when preparing a bundle launch preview", () => {
    const result = handleMockChat({
      message: "no",
      now,
      globalSettings: {
        speed: "turbo",
        jitoTip: 0.004,
        mevProtection: false,
        slippagePct: 5,
      },
      draft: {
        tool: "bundle_launch",
        data: {
          tokenName: "Blue Frog",
          symbol: "BFROG",
          description: "A blue frog community token.",
          walletCount: 2,
          solPerWallet: 0.25,
          imageFileName: "blue-frog.png",
          socialsEnabled: false,
          cashbackCoin: false,
          useDifferentBlocks: true,
          pregenerateTokenAddress: false,
        },
      },
    });

    expect(result.activePreview?.kind).toBe("bundle_launch");
    expect(result.activePreview).toMatchObject({
      globalSettings: {
        speed: "turbo",
        jitoTip: 0.004,
        mevProtection: false,
        slippagePct: 5,
      },
    });
  });

  it("rejects invalid bundle launch wallet count during collection", () => {
    const result = handleMockChat({
      message: "20",
      now,
      draft: {
        tool: "bundle_launch",
        data: {
          tokenName: "Blue Frog",
          symbol: "BFROG",
          description: "A blue frog community token.",
        },
      },
    });

    expect(result.assistantMessage.text).toBe(
      "Wallet count must be a whole number from 1 to 15.",
    );
    expect(result.draft?.data.walletCount).toBeUndefined();
  });

  it("rejects bundle launch descriptions over 250 characters", () => {
    const result = handleMockChat({
      message: "x".repeat(251),
      now,
      draft: {
        tool: "bundle_launch",
        data: {
          tokenName: "Blue Frog",
          symbol: "BFROG",
        },
      },
    });

    expect(result.assistantMessage.text).toBe(
      "Description must be 250 characters or fewer.",
    );
    expect(result.draft?.data.description).toBeUndefined();
  });

  it("rejects invalid bundle launch social URL prefixes", () => {
    const website = handleMockChat({
      message: "http://bluefrog.example",
      now,
      draft: {
        tool: "bundle_launch",
        data: launchDraftWaitingForWebsite(),
      },
    });
    expect(website.assistantMessage.text).toBe(
      "Website URL must start with https://.",
    );

    const telegram = handleMockChat({
      message: "https://example.com/bluefrog",
      now,
      draft: {
        tool: "bundle_launch",
        data: {
          ...launchDraftWaitingForWebsite(),
          socials: { website: "https://bluefrog.example" },
          socialStep: "telegram",
        },
      },
    });
    expect(telegram.assistantMessage.text).toBe(
      "Telegram URL must start with https://t.me/.",
    );

    const twitter = handleMockChat({
      message: "https://twitter.com/bluefrog",
      now,
      draft: {
        tool: "bundle_launch",
        data: {
          ...launchDraftWaitingForWebsite(),
          socials: {
            website: "https://bluefrog.example",
            telegram: "https://t.me/bluefrog",
          },
          socialStep: "twitter",
        },
      },
    });
    expect(twitter.assistantMessage.text).toBe(
      "Twitter/X URL must start with https://x.com/.",
    );
  });

  it("routes a sell request to a bundle swap preview", () => {
    const result = handleMockChat({
      message: "sell 80 percent from my bundle wallets",
      now,
      globalSettings: {
        speed: "turbo",
        jitoTip: 0.004,
        mevProtection: false,
        slippagePct: 5,
      },
    });

    expect(result.assistantMessage.text).toContain("Bundle Swap preview");
    expect(result.pendingPlan?.tool).toBe("bundle_swap");
    expect(result.activePreview?.kind).toBe("bundle_swap");
    expect(result.activePreview).toMatchObject({
      globalSettings: {
        speed: "turbo",
        jitoTip: 0.004,
        mevProtection: false,
        slippagePct: 5,
      },
    });
  });

  it("starts a bundle swap draft from a top-level buy request", () => {
    const result = handleMockChat({
      message: "buy 0.2 SOL with 3 wallets",
      now,
    });

    expect(result.executionStatus).toBe("Collecting swap fields");
    expect(result.assistantMessage.text).toBe(
      "What token should the swap end with?",
    );
    expect(result.draft).toMatchObject({
      tool: "bundle_swap",
      data: {
        direction: "sol_to_token",
        fromToken: "SOL",
        walletCount: 3,
        quantityMode: { type: "fixed", perTxSol: 0.2 },
      },
    });
  });

  it("does not prepare a swap preview when the selected wallet count is short", () => {
    const result = handleMockChat({
      message: "sell 80 percent from 10 bundle wallets",
      now,
    });

    expect(result.pendingPlan).toBeNull();
    expect(result.activePreview).toBeNull();
    expect(result.executionStatus).toBe("Collecting swap fields");
    expect(result.assistantMessage.text).toBe(
      "I need 10 participating bundle wallets before I can prepare this preview.",
    );
  });

  it("rejects invalid random percent ranges during swap collection", () => {
    const result = handleMockChat({
      message: "120 to 150",
      now,
      draft: {
        tool: "bundle_swap",
        data: {
          direction: "token_to_sol",
          fromToken: "SCATMint111",
          toToken: "SOL",
          walletCount: 2,
          pendingQuantityModeType: "random_pct",
        },
      },
    });

    expect(result.pendingPlan).toBeNull();
    expect(result.activePreview).toBeNull();
    expect(result.assistantMessage.text).toBe(
      "What random percent range should I use? Example: 80 to 100.",
    );
  });

  it("prepares a token-to-token bundle swap preview", () => {
    const result = handleMockChat({
      message: "skip",
      now,
      draft: {
        tool: "bundle_swap",
        data: {
          direction: "token_to_token",
          fromToken: "SourceMint111",
          toToken: "MigratedMint111",
          walletCount: 2,
          quantityMode: { type: "random_pct", minPct: 25, maxPct: 50 },
          txCount: 2,
          txDelayBlocks: 1,
        },
      },
      swapWalletSelection: {
        participatingWallets: [
          { pubkey: "wallet111", solBalance: 1, tokenBalance: 20 },
          { pubkey: "wallet222", solBalance: 1, tokenBalance: 0 },
        ],
      },
    });

    expect(result.pendingPlan?.tool).toBe("bundle_swap");
    expect(result.activePreview).toMatchObject({
      kind: "bundle_swap",
      direction: "token_to_token",
      fromToken: "SourceMint111",
      toToken: "MigratedMint111",
      readyWallets: 1,
      skippedWallets: 1,
      quantityModeLabel: "Random 25-50%",
    });
  });

  it("collects bundle swap fields before preparing a roster-backed preview", () => {
    const started = handleMockChat({
      message: "prepare a bundle swap",
      now,
    });

    expect(started.assistantMessage.text).toBe(
      "Which swap direction should I use? Reply buy, sell, or token to token.",
    );
    expect(started.executionStatus).toBe("Collecting swap fields");
    expect(started.draft).toMatchObject({
      tool: "bundle_swap",
      data: {},
    });

    const direction = handleMockChat({
      message: "buy",
      now,
      draft: started.draft,
    });
    const fromToken = handleMockChat({
      message: "SOL",
      now,
      draft: direction.draft,
    });
    const toToken = handleMockChat({
      message: "MigratedMint111",
      now,
      draft: fromToken.draft,
    });
    const wallets = handleMockChat({
      message: "3",
      now,
      draft: toToken.draft,
    });
    const quantityMode = handleMockChat({
      message: "total",
      now,
      draft: wallets.draft,
    });
    const amount = handleMockChat({
      message: "1.5",
      now,
      draft: quantityMode.draft,
    });
    const txCount = handleMockChat({
      message: "3",
      now,
      draft: amount.draft,
    });
    const txDelay = handleMockChat({
      message: "2",
      now,
      draft: txCount.draft,
    });
    const overrides = handleMockChat({
      message: "slippage 7, gas 0.00001, priority 0.0002, mev off",
      now,
      draft: txDelay.draft,
      swapWalletSelection: {
        participatingWallets: [
          { pubkey: "wallet111", solBalance: 1, tokenBalance: 0 },
          { pubkey: "wallet222", solBalance: 0.01, tokenBalance: 0 },
          { pubkey: "wallet333", solBalance: 1, tokenBalance: 0 },
        ],
      },
      globalSettings: {
        speed: "turbo",
        jitoTip: 0.004,
        mevProtection: true,
        slippagePct: 5,
      },
    });

    expect(overrides.assistantMessage.text).toContain("Bundle Swap preview");
    expect(overrides.pendingPlan?.tool).toBe("bundle_swap");
    expect(overrides.activePreview).toMatchObject({
      kind: "bundle_swap",
      direction: "sol_to_token",
      fromToken: "SOL",
      toToken: "MigratedMint111",
      routing: "pumpswap_amm",
      walletCount: 3,
      readyWallets: 2,
      skippedWallets: 1,
      quantityModeLabel: "Total 1.5 SOL",
      txCount: 3,
      txDelayBlocks: 2,
      estimatedTotalS: 2.4,
      perTxOverrides: {
        slippagePct: 7,
        gas: 0.00001,
        priority: 0.0002,
        mevShield: false,
      },
    });
    expect(overrides.activePreview?.summary).toContain("pumpswap_amm");
    expect(overrides.draft).toBeNull();
  });

  it("routes a volume request to a volume bot preview", () => {
    const result = handleMockChat({
      message: "start a volume bot with sell strategy",
      now,
      globalSettings: {
        speed: "turbo",
        jitoTip: 0.004,
        mevProtection: false,
        slippagePct: 5,
      },
    });

    expect(result.assistantMessage.text).toContain("Volume Bot preview");
    expect(result.pendingPlan?.tool).toBe("volume_bot");
    expect(result.activePreview?.kind).toBe("volume_bot");
    expect(result.activePreview).toMatchObject({
      globalSettings: {
        speed: "turbo",
        jitoTip: 0.004,
        mevProtection: false,
        slippagePct: 5,
      },
    });
  });

  it("rejects confirmation without an active plan", () => {
    const result = handleMockChat({
      message: "confirm",
      now,
    });

    expect(result.assistantMessage.text).toBe(
      "There is no active preview to confirm. Ask me to prepare a launch, swap, or volume bot first.",
    );
    expect(result.pendingPlan).toBeNull();
    expect(result.executionStatus).toBe("Waiting for preview");
  });

  it("executes the pending plan when user confirms before TTL expires", () => {
    const prepared = handleMockChat({
      message: "yes",
      now,
      draft: {
        tool: "bundle_launch",
        data: {
          tokenName: "Blue Frog",
          symbol: "BFROG",
          description: "A blue frog community token.",
          walletCount: 3,
          solPerWallet: 0.5,
          imageFileName: "blue-frog.png",
          socialsEnabled: false,
          cashbackCoin: false,
          useDifferentBlocks: true,
        },
      },
    });

    const executed = handleMockChat({
      message: "launch",
      now: now + 60_000,
      pendingPlan: prepared.pendingPlan,
    });

    expect(executed.assistantMessage.text).toContain("Mock Bundle Launch executed");
    expect(executed.pendingPlan).toBeNull();
    expect(executed.executionStatus).toContain("MockMint1111");
  });

  it("expires a pending plan after five minutes", () => {
    const prepared = handleMockChat({
      message: "volume bot",
      now,
    });

    const expired = handleMockChat({
      message: "start",
      now: now + 301_000,
      pendingPlan: prepared.pendingPlan,
    });

    expect(expired.assistantMessage.text).toBe(
      "That preview expired. Prepare it again before executing.",
    );
    expect(expired.pendingPlan).toBeNull();
    expect(expired.executionStatus).toBe("Preview expired");
  });
});

function launchDraftWaitingForWebsite() {
  return {
    tokenName: "Blue Frog",
    symbol: "BFROG",
    description: "A blue frog community token.",
    walletCount: 3,
    solPerWallet: 0.5,
    imageFileName: "blue-frog.png",
    socialsEnabled: true,
    socialStep: "website" as const,
  };
}
