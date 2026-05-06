import { Keypair, PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";

import {
  browserLiveSubmitReadiness,
  executeBrowserLiveSubmit,
  type BrowserLiveSubmitPacket,
} from "../../src/lib/smithii/browser-live-submit";
import type { PumpBrowserExecutorClient } from "../../src/lib/smithii/pump-browser-executor";
import type { BrowserWalletSigner } from "../../src/lib/solana/browser-wallet-signer";

const secretValuePattern = /SECRET_(BUYER|SWAP)_PK|SHOULD_NOT_RETURN|metadata body/i;
const secretLabelPattern = /\b(pk|privKeys|privateKey|secretKey|seedPhrase)\b/i;

const validEnv = {
  NEXT_PUBLIC_SOLANA_RPC_URL: "https://rpc.example",
  NEXT_PUBLIC_SMITHII_PROXY_URL: "https://proxy.example",
  NEXT_PUBLIC_SMITHII_JITO_UUID: "jito-uuid",
};

describe("Smithii browser live submit", () => {
  it.each([
    ["missing packet", { packet: null, signer: signer(), approval: true, env: validEnv }, "Browser packet must be prepared before live submit."],
    ["missing signer", { packet: launchPacket(), signer: null, approval: true, env: validEnv }, "Connected browser wallet signer is required."],
    ["missing approval", { packet: launchPacket(), signer: signer(), approval: false, env: validEnv }, "Explicit live submit approval is required."],
    ["missing config", { packet: launchPacket(), signer: signer(), approval: true, env: { ...validEnv, NEXT_PUBLIC_SOLANA_RPC_URL: "" } }, "Smithii browser handoff RPC URL is required."],
  ])("blocks %s", (_label, input, reason) => {
    expect(browserLiveSubmitReadiness(input)).toEqual({ status: "blocked", reason });
  });

  it("submits Bundle Launch through the Pump browser executor and returns sanitized success", async () => {
    const client = pumpClient({
      uploadMetadata: async (metadata) => {
        expect(metadata).toMatchObject({
          name: "Blue Frog",
          description: "metadata body should stay local",
        });
        return { metadata: { name: metadata.name, symbol: metadata.symbol }, metadataUri: "ipfs://blue" };
      },
      createAndSnipeToken: async (input) => {
        expect(input.buyers).toEqual([{ pk: "SECRET_BUYER_PK", amount: 0.1 }]);
        return {
          createTxSignature: "create-signature",
          buyerTxSignatures: ["buyer-signature"],
          bundleIds: ["bundle-1"],
          paymentSignature: "payment-signature",
          unsafeBody: { privateKey: "SHOULD_NOT_RETURN" },
        };
      },
    });

    const result = await executeBrowserLiveSubmit({
      packet: launchPacket(),
      signer: signer(),
      approval: true,
      env: validEnv,
      clientFactory: () => client,
      now: new Date("2026-05-06T10:00:00.000Z"),
    });

    expect(result).toMatchObject({
      status: "submitted",
      result: {
        flow: "bundle_launch",
        createTxSignature: "create-signature",
        buyerTxSignatures: ["buyer-signature"],
        bundleIds: ["bundle-1"],
        paymentSignature: "payment-signature",
      },
    });
    expect(JSON.stringify(result)).not.toMatch(secretValuePattern);
    expect(JSON.stringify(result)).not.toMatch(secretLabelPattern);
  });

  it("submits Bundle Swap through the Pump browser executor and returns sanitized success", async () => {
    const client = pumpClient({
      bundleSellBuy: async (input) => {
        expect(input).toMatchObject({
          action: "buy",
          pool: "pump",
          privKeys: ["SECRET_SWAP_PK"],
          amounts: [0.2],
        });
        return {
          bundleIds: ["bundle-buy"],
          txSignatures: ["tx-buy"],
          paymentSignature: "payment-buy",
          unsafeBody: { privateKey: "SHOULD_NOT_RETURN" },
        };
      },
    });

    const result = await executeBrowserLiveSubmit({
      packet: swapPacket(),
      signer: signer(),
      approval: true,
      env: validEnv,
      clientFactory: () => client,
      now: new Date("2026-05-06T10:00:00.000Z"),
    });

    expect(result).toEqual({
      status: "submitted",
      result: {
        flow: "bundle_swap",
        planId: "live_bundle_swap_test",
        idempotencyKey: "idempotency-key",
        action: "buy",
        bundleIds: ["bundle-buy"],
        txSignatures: ["tx-buy"],
        paymentSignature: "payment-buy",
      },
    });
    expect(JSON.stringify(result)).not.toMatch(secretValuePattern);
    expect(JSON.stringify(result)).not.toMatch(secretLabelPattern);
  });

  it("returns normalized sanitized errors from executor failures", async () => {
    const result = await executeBrowserLiveSubmit({
      packet: swapPacket(),
      signer: signer(),
      approval: true,
      env: validEnv,
      clientFactory: () =>
        pumpClient({
          bundleSellBuy: async () => {
            throw Object.assign(new Error("bundle exploded"), {
              name: "BundleError",
              body: { privateKey: "SHOULD_NOT_RETURN" },
            });
          },
        }),
      now: new Date("2026-05-06T10:00:00.000Z"),
    });

    expect(result).toEqual({
      status: "failed",
      error: {
        category: "bundle_failed",
        message: "bundle exploded",
      },
    });
    expect(JSON.stringify(result)).not.toMatch(secretValuePattern);
    expect(JSON.stringify(result)).not.toMatch(secretLabelPattern);
  });
});

function signer(): BrowserWalletSigner {
  return {
    publicKey: { toBase58: () => "Wallet111" },
    signTransaction: async (tx) => tx,
    signAllTransactions: async (txs) => txs,
  };
}

function launchPacket(): BrowserLiveSubmitPacket {
  const mintKeypair = Keypair.generate();
  return {
    kind: "bundle_launch",
    executorInput: {
      plan: browserPlan("bundle_launch"),
      metadata: {
        name: "Blue Frog",
        symbol: "BFROG",
        description: "metadata body should stay local",
        file: new Blob(["image-bytes"]),
      },
      mintKeypair,
      devAmount: 0.1,
      buyers: [{ pk: "SECRET_BUYER_PK", amount: 0.1 }],
      isCashbackCoin: false,
      isTokenPregenerated: false,
    },
  };
}

function swapPacket(): BrowserLiveSubmitPacket {
  return {
    kind: "bundle_swap",
    executorInput: {
      plan: browserPlan("bundle_swap"),
      mint: new PublicKey("11111111111111111111111111111111"),
      direction: "sol_to_token",
      pool: "pump",
      privKeys: ["SECRET_SWAP_PK"],
      amounts: [0.2],
    },
  };
}

function browserPlan(flow: "bundle_launch" | "bundle_swap") {
  return {
    planId: `live_${flow}_test`,
    flow,
    wallet: "Wallet111",
    paramsHash: "params-hash",
    expectedFeesLamports: "100000000",
    expiresAt: "2026-05-06T10:05:00.000Z",
    nonce: "nonce",
    idempotencyKey: "idempotency-key",
  };
}

function pumpClient(overrides: Partial<PumpBrowserExecutorClient>): PumpBrowserExecutorClient {
  return {
    uploadMetadata: async () => {
      throw new Error("uploadMetadata unused");
    },
    createAndSnipeToken: async () => {
      throw new Error("createAndSnipeToken unused");
    },
    bundleSellBuy: async () => {
      throw new Error("bundleSellBuy unused");
    },
    ...overrides,
  };
}
