import { Keypair, PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";

import {
  assertBrowserExecutionPlan,
  executePumpBundleLaunchBrowserHandoff,
  executePumpBundleSwapBrowserHandoff,
  normalizePumpBrowserExecutionError,
  PumpBrowserExecutionError,
} from "../../src/lib/smithii/pump-browser-executor";

type PumpBrowserExecutorClientInput = Parameters<
  typeof executePumpBundleLaunchBrowserHandoff
>[0];

describe("Smithii Pump browser executor", () => {
  it("normalizes SDK-like errors without copying unsafe bodies", () => {
    const error = Object.assign(new Error("bundle exploded"), {
      name: "BundleError",
      bundleId: "bundle-123",
      body: { privateKey: "SHOULD_NOT_ECHO" },
    });

    const normalized = normalizePumpBrowserExecutionError(error);

    expect(normalized).toEqual({
      category: "bundle_failed",
      message: "bundle exploded",
      bundleId: "bundle-123",
    });
    expect(JSON.stringify(normalized)).not.toContain("SHOULD_NOT_ECHO");
    expect(JSON.stringify(normalized)).not.toContain("privateKey");
  });

  it("rejects wrong-flow and expired browser execution plans before SDK calls", () => {
    const launchPlan = browserPlan("bundle_launch", "2026-05-06T08:05:00.000Z");
    expect(() =>
      assertBrowserExecutionPlan(launchPlan, "bundle_swap", new Date("2026-05-06T08:00:00.000Z")),
    ).toThrow(PumpBrowserExecutionError);

    const expiredPlan = browserPlan("bundle_swap", "2026-05-06T08:05:00.000Z");
    expect(() =>
      assertBrowserExecutionPlan(expiredPlan, "bundle_swap", new Date("2026-05-06T08:05:00.001Z")),
    ).toThrow(PumpBrowserExecutionError);
  });

  it("uploads metadata before creating and sniping a token without returning secrets", async () => {
    const calls: string[] = [];
    const uploadedMetadata = {
      metadata: { name: "Uploaded Token", symbol: "BLUE" },
      metadataUri: "ipfs://metadata",
    };
    const createCalls: unknown[] = [];
    const client = {
      uploadMetadata: async (metadata: unknown) => {
        calls.push("uploadMetadata");
        expect(metadata).toMatchObject({
          name: "Blue Frog",
          description: "Launch metadata should stay out of results",
        });
        return uploadedMetadata;
      },
      createAndSnipeToken: async (input: unknown) => {
        calls.push("createAndSnipeToken");
        createCalls.push(input);
        return {
          createTxSignature: "create-signature",
          buyerTxSignatures: ["buyer-signature-1", "buyer-signature-2"],
          bundleIds: ["bundle-1"],
          paymentSignature: "payment-signature",
          unsafeBody: { privateKey: "SHOULD_NOT_RETURN" },
        };
      },
      bundleSellBuy: async () => {
        throw new Error("unused");
      },
    };
    const mintKeypair = Keypair.generate();
    const buyers = [
      { pk: "SECRET_BUYER_PK_1", amount: 0.1 },
      { pk: "SECRET_BUYER_PK_2", amount: 0.2 },
    ];

    const result = await executePumpBundleLaunchBrowserHandoff(client, {
      plan: browserPlan("bundle_launch", "2026-05-06T08:05:00.000Z"),
      metadata: {
        name: "Blue Frog",
        symbol: "BLUE",
        description: "Launch metadata should stay out of results",
        file: new Blob(["image"]),
        twitter: "https://x.com/bluefrog",
        telegram: null,
        website: null,
      },
      mintKeypair,
      devAmount: 0.5,
      buyers,
      isCashbackCoin: false,
      isTokenPregenerated: false,
      now: new Date("2026-05-06T08:00:00.000Z"),
    });

    expect(calls).toEqual(["uploadMetadata", "createAndSnipeToken"]);
    expect(createCalls[0]).toMatchObject({
      mintKeypair,
      metadata: uploadedMetadata,
      devAmount: 0.5,
      buyers,
      isCashbackCoin: false,
      isTokenPregenerated: false,
    });
    expect(result).toEqual({
      flow: "bundle_launch",
      planId: "live_bundle_launch_test",
      idempotencyKey: "idempotency-key",
      mint: mintKeypair.publicKey.toBase58(),
      createTxSignature: "create-signature",
      buyerTxSignatures: ["buyer-signature-1", "buyer-signature-2"],
      bundleIds: ["bundle-1"],
      paymentSignature: "payment-signature",
    });
    expect(JSON.stringify(result)).not.toContain("SECRET_BUYER_PK");
    expect(JSON.stringify(result)).not.toContain("Launch metadata should stay out of results");
    expect(JSON.stringify(result)).not.toContain("SHOULD_NOT_RETURN");
  });

  it("rejects malformed launch SDK results instead of returning success-shaped output", async () => {
    const client = {
      uploadMetadata: async () => ({
        metadata: { name: "Uploaded Token", symbol: "BLUE" },
        metadataUri: "ipfs://metadata",
      }),
      createAndSnipeToken: async () => ({
        buyerTxSignatures: ["buyer-signature"],
        bundleIds: ["bundle-1"],
        paymentSignature: "payment-signature",
      }),
      bundleSellBuy: async () => {
        throw new Error("unused");
      },
    } as unknown as PumpBrowserExecutorClientInput;

    await expect(
      executePumpBundleLaunchBrowserHandoff(client, {
        plan: browserPlan("bundle_launch", "2026-05-06T08:05:00.000Z"),
        metadata: {
          name: "Blue Frog",
          symbol: "BLUE",
          description: "Launch metadata should stay out of results",
          file: new Blob(["image"]),
        },
        mintKeypair: Keypair.generate(),
        devAmount: 0.5,
        buyers: [{ pk: "SECRET_BUYER_PK", amount: 0.1 }],
        isCashbackCoin: false,
        isTokenPregenerated: false,
        now: new Date("2026-05-06T08:00:00.000Z"),
      }),
    ).rejects.toMatchObject({
      category: "unknown",
      message: "Smithii launch result is missing createTxSignature.",
    });
  });

  it("maps supported bundle swap directions to SDK actions without returning private keys", async () => {
    const bundleSellBuyCalls: unknown[] = [];
    const client = pumpClientWithBundleSellBuy(async (input) => {
      bundleSellBuyCalls.push(input);
      return {
        bundleIds: [`bundle-${input.action}`],
        txSignatures: [`tx-${input.action}`],
        paymentSignature: `payment-${input.action}`,
        rawPrivKeys: input.privKeys,
      };
    });
    const mint = new PublicKey("11111111111111111111111111111111");

    const buyResult = await executePumpBundleSwapBrowserHandoff(client, {
      plan: browserPlan("bundle_swap", "2026-05-06T08:05:00.000Z"),
      mint,
      direction: "sol_to_token",
      pool: "pump",
      privKeys: ["SECRET_SWAP_PK_1"],
      amounts: [0.1],
      now: new Date("2026-05-06T08:00:00.000Z"),
    });
    const sellResult = await executePumpBundleSwapBrowserHandoff(client, {
      plan: browserPlan("bundle_swap", "2026-05-06T08:05:00.000Z"),
      mint,
      direction: "token_to_sol",
      pool: "pump-amm",
      privKeys: ["SECRET_SWAP_PK_2"],
      amounts: [25],
      now: new Date("2026-05-06T08:00:00.000Z"),
    });

    expect(bundleSellBuyCalls).toEqual([
      {
        mint,
        action: "buy",
        pool: "pump",
        privKeys: ["SECRET_SWAP_PK_1"],
        amounts: [0.1],
      },
      {
        mint,
        action: "sell",
        pool: "pump-amm",
        privKeys: ["SECRET_SWAP_PK_2"],
        amounts: [25],
      },
    ]);
    expect(buyResult).toEqual({
      flow: "bundle_swap",
      planId: "live_bundle_swap_test",
      idempotencyKey: "idempotency-key",
      action: "buy",
      bundleIds: ["bundle-buy"],
      txSignatures: ["tx-buy"],
      paymentSignature: "payment-buy",
    });
    expect(sellResult).toEqual({
      flow: "bundle_swap",
      planId: "live_bundle_swap_test",
      idempotencyKey: "idempotency-key",
      action: "sell",
      bundleIds: ["bundle-sell"],
      txSignatures: ["tx-sell"],
      paymentSignature: "payment-sell",
    });
    expect(JSON.stringify([buyResult, sellResult])).not.toContain("SECRET_SWAP_PK");
  });

  it("rejects unsupported or invalid bundle swap inputs before SDK calls", async () => {
    const bundleSellBuyCalls: unknown[] = [];
    const client = pumpClientWithBundleSellBuy(async (input) => {
      bundleSellBuyCalls.push(input);
      return {};
    });
    const mint = new PublicKey("11111111111111111111111111111111");
    const baseInput = {
      plan: browserPlan("bundle_swap", "2026-05-06T08:05:00.000Z"),
      mint,
      pool: "pump" as const,
      now: new Date("2026-05-06T08:00:00.000Z"),
    };

    await expect(
      executePumpBundleSwapBrowserHandoff(client, {
        ...baseInput,
        direction: "token_to_token",
        privKeys: ["SECRET_SWAP_PK"],
        amounts: [0.1],
      }),
    ).rejects.toMatchObject({ category: "validation" });

    await expect(
      executePumpBundleSwapBrowserHandoff(client, {
        ...baseInput,
        direction: "sol_to_token",
        privKeys: [],
        amounts: [0.1],
      }),
    ).rejects.toMatchObject({ category: "validation" });

    await expect(
      executePumpBundleSwapBrowserHandoff(client, {
        ...baseInput,
        direction: "sol_to_token",
        privKeys: ["SECRET_SWAP_PK"],
        amounts: [],
      }),
    ).rejects.toMatchObject({ category: "validation" });

    await expect(
      executePumpBundleSwapBrowserHandoff(client, {
        ...baseInput,
        direction: "sol_to_token",
        privKeys: ["SECRET_SWAP_PK"],
        amounts: [0.1, 0.2],
      }),
    ).rejects.toMatchObject({ category: "validation" });

    expect(bundleSellBuyCalls).toEqual([]);
  });

  it("rejects malformed swap SDK results instead of returning success-shaped output", async () => {
    const client = pumpClientWithBundleSellBuy(async () => ({
      bundleIds: ["bundle-buy"],
      paymentSignature: "payment-buy",
    }));

    await expect(
      executePumpBundleSwapBrowserHandoff(client, {
        plan: browserPlan("bundle_swap", "2026-05-06T08:05:00.000Z"),
        mint: new PublicKey("11111111111111111111111111111111"),
        direction: "sol_to_token",
        pool: "pump",
        privKeys: ["SECRET_SWAP_PK"],
        amounts: [0.1],
        now: new Date("2026-05-06T08:00:00.000Z"),
      }),
    ).rejects.toMatchObject({
      category: "unknown",
      message: "Smithii swap result is missing txSignatures.",
    });
  });
});

function browserPlan(flow: "bundle_launch" | "bundle_swap", expiresAt: string) {
  return {
    planId: `live_${flow}_test`,
    flow,
    wallet: "Wallet111",
    paramsHash: "params-hash",
    expectedFeesLamports: "100000000",
    expiresAt,
    nonce: "nonce",
    idempotencyKey: "idempotency-key",
  };
}

function pumpClientWithBundleSellBuy(
  bundleSellBuy: (input: {
    mint: PublicKey;
    action: "buy" | "sell";
    pool: "pump" | "pump-amm";
    privKeys: string[];
    amounts: number[];
  }) => Promise<unknown>,
) {
  return {
    uploadMetadata: async () => {
      throw new Error("unused");
    },
    createAndSnipeToken: async () => {
      throw new Error("unused");
    },
    bundleSellBuy,
  } as unknown as PumpBrowserExecutorClientInput;
}
