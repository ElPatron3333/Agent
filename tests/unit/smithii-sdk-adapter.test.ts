import { Keypair } from "@solana/web3.js";
import { describe, expect, it } from "vitest";

import {
  getSmithiiSdkIntegrationAssessment,
  pumpSwapTargetForInput,
  rejectAntiMevRunMultipleForMvp,
  SMITHII_SDK_ZERO_CUSTODY_RULES,
  toAntiMevSinglePlan,
  toPumpBundleSellBuyArgs,
  toPumpCreateAndSnipeArgs,
} from "../../src/lib/smithii/sdk-adapter";
import type {
  BundleLaunchInput,
  BundleSwapInput,
  GlobalSettings,
  VolumeBotInput,
} from "../../src/lib/smithii/types";

const globalSettings: GlobalSettings = {
  speed: "fast",
  jitoTip: "default",
  mevProtection: true,
  slippagePct: 10,
};

describe("Smithii SDK adapter spike", () => {
  it("documents SDK coverage and the backend private-key boundary", () => {
    const assessment = getSmithiiSdkIntegrationAssessment();

    expect(SMITHII_SDK_ZERO_CUSTODY_RULES.backendMayReceivePrivateKeys).toBe(
      false,
    );
    expect(assessment.bundleLaunch.coverage).toBe("direct_browser_only");
    expect(assessment.bundleSwap.unsupported).toContain("token_to_token");
    expect(assessment.volumeBot.coverage).toBe(
      "partial_pending_smithii_confirmation",
    );
    expect(assessment.volumeBot.blockedMethods).toContain(
      "AntiMEVClient.runMultiple",
    );
  });

  it("maps bundle launch input to PumpFun createAndSnipe args", () => {
    const mintKeypair = Keypair.generate();
    const args = toPumpCreateAndSnipeArgs({
      runtime: "browser",
      input: bundleLaunchInput(),
      metadata: {
        metadata: { name: "Blue Frog", symbol: "BFROG" },
        metadataUri: "ipfs://blue-frog",
      },
      mintKeypair,
      buyerPrivateKeys: ["buyer-key-1", "buyer-key-2"],
      devAmountSol: 0.2,
    });

    expect(args).toMatchObject({
      metadata: {
        metadata: { name: "Blue Frog", symbol: "BFROG" },
        metadataUri: "ipfs://blue-frog",
      },
      devAmount: 0.2,
      buyers: [
        { pk: "buyer-key-1", amount: 0.5 },
        { pk: "buyer-key-2", amount: 0.75 },
      ],
      isTokenPregenerated: true,
      isCashbackCoin: true,
      referrer: null,
      plan: null,
    });
    expect(args.mintKeypair).toBe(mintKeypair);
  });

  it("blocks launch private keys outside the browser and validates counts", () => {
    expect(() =>
      toPumpCreateAndSnipeArgs({
        runtime: "server",
        input: bundleLaunchInput(),
        metadata: {
          metadata: { name: "Blue Frog", symbol: "BFROG" },
          metadataUri: "ipfs://blue-frog",
        },
        mintKeypair: Keypair.generate(),
        buyerPrivateKeys: ["buyer-key-1", "buyer-key-2"],
      }),
    ).toThrow("Bundle Launch private keys must stay in the browser");

    expect(() =>
      toPumpCreateAndSnipeArgs({
        runtime: "browser",
        input: bundleLaunchInput(),
        metadata: {
          metadata: { name: "Blue Frog", symbol: "BFROG" },
          metadataUri: "ipfs://blue-frog",
        },
        mintKeypair: Keypair.generate(),
        buyerPrivateKeys: ["buyer-key-1"],
      }),
    ).toThrow("Bundle Launch buyer key count must match bundle wallet count.");
  });

  it("maps SOL/token bundle swaps to PumpFun bundleSellBuy args", () => {
    const mint = Keypair.generate().publicKey.toBase58();
    const args = toPumpBundleSellBuyArgs({
      runtime: "browser",
      input: bundleSwapInput({ toToken: mint }),
      privateKeys: ["wallet-key-1", "wallet-key-2"],
      amounts: [0.1, 0.2],
    });

    expect(args).toMatchObject({
      privKeys: ["wallet-key-1", "wallet-key-2"],
      amounts: [0.1, 0.2],
      action: "buy",
      pool: "pump",
      referrer: null,
      plan: null,
    });
    expect(args.mint.toBase58()).toBe(mint);
  });

  it("detects swap target action and unsupported token-to-token swaps", () => {
    const buyMint = Keypair.generate().publicKey.toBase58();
    const sellMint = Keypair.generate().publicKey.toBase58();

    expect(
      pumpSwapTargetForInput(bundleSwapInput({ toToken: buyMint })),
    ).toEqual({
      action: "buy",
      mintAddress: buyMint,
      routing: "pumpfun_bonding",
    });
    expect(
      pumpSwapTargetForInput(
        bundleSwapInput({
          direction: "token_to_sol",
          fromToken: sellMint,
          toToken: "SOL",
        }),
      ),
    ).toEqual({
      action: "sell",
      mintAddress: sellMint,
      routing: "pumpfun_bonding",
    });
    expect(() =>
      pumpSwapTargetForInput(
        bundleSwapInput({
          direction: "token_to_token",
          fromToken: sellMint,
          toToken: buyMint,
        }),
      ),
    ).toThrow("bundleSellBuy does not expose token-to-token swaps");
  });

  it("blocks bundle swap private keys outside the browser", () => {
    expect(() =>
      toPumpBundleSellBuyArgs({
        runtime: "server",
        input: bundleSwapInput({
          toToken: Keypair.generate().publicKey.toBase58(),
        }),
        privateKeys: ["wallet-key-1", "wallet-key-2"],
        amounts: [0.1, 0.2],
      }),
    ).toThrow("Bundle Swap private keys must stay in the browser");
  });

  it("rejects empty bundle swap private keys and invalid amounts", () => {
    const input = bundleSwapInput({
      toToken: Keypair.generate().publicKey.toBase58(),
    });

    expect(() =>
      toPumpBundleSellBuyArgs({
        runtime: "browser",
        input,
        privateKeys: ["wallet-key-1", ""],
        amounts: [0.1, 0.2],
      }),
    ).toThrow("Bundle Swap private keys must be non-empty.");

    for (const invalidAmount of [0, -0.1, Number.NaN]) {
      expect(() =>
        toPumpBundleSellBuyArgs({
          runtime: "browser",
          input,
          privateKeys: ["wallet-key-1", "wallet-key-2"],
          amounts: [invalidAmount, 0.2],
        }),
      ).toThrow("Bundle Swap amounts must be finite positive numbers.");
    }
  });

  it("maps volume bot input to the signer-only Anti-MEV single flow", () => {
    const plan = toAntiMevSinglePlan(volumeBotInput(), "pump");

    expect(plan).toMatchObject({
      client: "AntiMEVClient",
      method: "runSingle",
      variant: "pump",
      coverage: "partial_pending_smithii_confirmation",
      config: {
        tokenAddress: "Mint111",
        antiMEVUses: 200,
        amount: { mode: "random", randomMin: 0.01, randomMax: 0.02 },
        delay: { mode: "random", randomMinDelay: 10, randomMaxDelay: 20 },
      },
      disallowedAlternative: {
        method: "runMultiple",
        reason: "Requires privateKeys[] sent to Smithii backend.",
      },
    });
    expect(plan.unresolvedFields).toContain("sellStrategy");
    expect("randomize" in plan.config).toBe(false);
    expect(plan.questionsForSmithii).toHaveLength(3);
  });

  it("maps fixed volume bot ranges to fixed Anti-MEV config values", () => {
    const plan = toAntiMevSinglePlan({
      ...volumeBotInput(),
      orderAmount: { minSol: 0.03, maxSol: 0.03 },
      delaySeconds: { min: 15, max: 15 },
      sellMode: "sell_100",
      sellStrategy: undefined,
    } as VolumeBotInput);

    expect(plan.config.amount).toEqual({ mode: "fixed", fixedAmount: 0.03 });
    expect(plan.config.delay).toEqual({ mode: "fixed", fixedDelay: 15 });
    expect(plan.unresolvedFields).not.toContain("sellStrategy");
  });

  it("rejects AntiMEV runMultiple for the MVP", () => {
    expect(() =>
      rejectAntiMevRunMultipleForMvp({
        tokenAddress: "Mint111",
        antiMEVUses: 10,
        privateKeys: ["backend-key"],
        privateAmounts: [0.01],
        randomMinDelay: 10,
        randomMaxDelay: 20,
      }),
    ).toThrow("sends privateKeys[] to the backend");
  });
});

function bundleLaunchInput(): BundleLaunchInput {
  return {
    dex: "pumpfun",
    token: {
      name: "Blue Frog",
      symbol: "BFROG",
      description: "A blue frog community token.",
      imageFileName: "blue-frog.png",
      socialsEnabled: false,
    },
    modifiers: {
      cashbackCoin: true,
      useDifferentBlocks: true,
      pregenerateTokenAddress: true,
    },
    devWalletPubkey: "dev111",
    bundleWallets: [
      { pubkey: "wallet111", buyAmountSol: 0.5 },
      { pubkey: "wallet222", buyAmountSol: 0.75 },
    ],
    globalSettings,
  };
}

function bundleSwapInput(
  overrides: Partial<BundleSwapInput> = {},
): BundleSwapInput {
  return {
    direction: "sol_to_token",
    fromToken: "SOL",
    toToken: Keypair.generate().publicKey.toBase58(),
    participatingWallets: [
      { pubkey: "wallet111", solBalance: 1, tokenBalance: 10 },
      { pubkey: "wallet222", solBalance: 1, tokenBalance: 20 },
    ],
    quantityMode: { type: "fixed", perTxSol: 0.1 },
    txCount: 2,
    txDelayBlocks: 1,
    globalSettings,
    ...overrides,
  };
}

function volumeBotInput(): VolumeBotInput {
  return {
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
  };
}
