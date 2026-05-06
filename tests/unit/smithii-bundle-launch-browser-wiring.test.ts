import { Keypair } from "@solana/web3.js";
import { describe, expect, it } from "vitest";

import type { ActivePreview, PendingPlan } from "../../src/lib/agent/mock-chat";
import {
  bundleLaunchBrowserExecutionSummary,
  prepareBundleLaunchBrowserExecution,
} from "../../src/lib/smithii/bundle-launch-browser-wiring";
import { executePumpBundleLaunchBrowserHandoff } from "../../src/lib/smithii/pump-browser-executor";
import type { SmithiiLiveBoundary } from "../../src/lib/smithii/live-boundary";
import type { BrowserWalletEntry } from "../../src/lib/wallet-roster";

const secretLabelPattern = /\b(pk|buyers|privateKey|privateKeys|secretKey|mnemonic|seedPhrase)\b/i;
const secretValuePattern = /SECRET_LAUNCH_PK|SECRET_BUYER_PK|SECRET_DEV_PK/i;
const descriptionBody = "A blue frog launch description that must stay out of public summaries.";

const globalSettings = {
  speed: "fast",
  jitoTip: "default",
  mevProtection: true,
  slippagePct: 10,
} as const;

describe("Smithii Bundle Launch browser wiring", () => {
  it("prepares a browser-local launch packet with a non-secret public plan and summary", () => {
    const metadataFile = new Blob(["PNG_IMAGE_BYTES_SHOULD_STAY_LOCAL"], { type: "image/png" });
    const mintKeypair = Keypair.generate();

    const prepared = prepareBundleLaunchBrowserExecution({
      activePreview: bundleLaunchPreview(),
      pendingPlan: pendingPlan("bundle_launch"),
      smithiiLive: boundary("browser-handoff-ready"),
      walletRoster: browserWalletRoster(),
      metadataFile,
      mintKeypair,
      nonce: "nonce-8g",
      now: new Date("2026-05-06T09:00:00.000Z"),
    });

    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") {
      throw new Error(prepared.reason);
    }

    expect(prepared.packet.plan.flow).toBe("bundle_launch");
    expect(prepared.packet.plan.wallet).toBe("DevWallet111");
    expect(prepared.packet.plan.expectedFeesLamports).toBe("350000000");
    expect(prepared.packet.executorInput.metadata).toMatchObject({
      name: "Blue Frog",
      symbol: "BFROG",
      description: descriptionBody,
      filename: "blue-frog.png",
      twitter: "https://x.com/bluefrog",
      telegram: null,
      website: "https://bluefrog.example",
    });
    expect(prepared.packet.executorInput.metadata.file).toBe(metadataFile);
    expect(prepared.packet.executorInput.mintKeypair).toBe(mintKeypair);
    expect(prepared.packet.executorInput.devAmount).toBeCloseTo(0.15);
    expect(prepared.packet.executorInput.buyers).toEqual([
      { pk: "SECRET_BUYER_PK_1", amount: 0.2 },
      { pk: "SECRET_BUYER_PK_2", amount: 0.3 },
    ]);
    expect(prepared.packet.executorInput.isCashbackCoin).toBe(true);
    expect(prepared.packet.executorInput.isTokenPregenerated).toBe(true);

    const mintSecretMaterial = Array.from(mintKeypair.secretKey).join(",");
    const summary = bundleLaunchBrowserExecutionSummary(prepared.packet);
    expect(summary).toEqual({
      status: "Browser launch packet prepared",
      flow: "bundle_launch",
      planId: prepared.packet.plan.planId,
      idempotencyKey: prepared.packet.plan.idempotencyKey,
      mint: mintKeypair.publicKey.toBase58(),
      devAmount: 0.15,
      buyerCount: 2,
      expectedFeesLamports: "350000000",
      isTokenPregenerated: true,
      isCashbackCoin: true,
    });

    expect(JSON.stringify(prepared.packet.plan)).not.toMatch(secretLabelPattern);
    expect(JSON.stringify(prepared.packet.plan)).not.toMatch(secretValuePattern);
    expect(JSON.stringify(prepared.packet.plan)).not.toContain(descriptionBody);
    expect(JSON.stringify(prepared.packet.plan)).not.toContain("PNG_IMAGE_BYTES_SHOULD_STAY_LOCAL");
    expect(JSON.stringify(prepared.packet.plan)).not.toContain(mintSecretMaterial);
    expect(JSON.stringify(summary)).not.toMatch(secretLabelPattern);
    expect(JSON.stringify(summary)).not.toMatch(secretValuePattern);
    expect(JSON.stringify(summary)).not.toContain(descriptionBody);
    expect(JSON.stringify(summary)).not.toContain("PNG_IMAGE_BYTES_SHOULD_STAY_LOCAL");
    expect(JSON.stringify(summary)).not.toContain(mintSecretMaterial);
  });

  it("produces executor input compatible with the Pump browser launch executor", async () => {
    const metadataFile = new Blob(["image"]);
    const mintKeypair = Keypair.generate();
    const prepared = prepareBundleLaunchBrowserExecution({
      activePreview: bundleLaunchPreview({ pregenerateTokenAddress: false, cashbackCoin: false }),
      pendingPlan: pendingPlan("bundle_launch"),
      smithiiLive: boundary("browser-handoff-ready"),
      walletRoster: browserWalletRoster(),
      metadataFile,
      mintKeypair,
      nonce: "nonce-8g-exec",
      now: new Date("2026-05-06T09:00:00.000Z"),
    });

    expect(prepared.status).toBe("ready");
    if (prepared.status !== "ready") {
      throw new Error(prepared.reason);
    }

    const result = await executePumpBundleLaunchBrowserHandoff(
      {
        uploadMetadata: async (metadata) => {
          expect(metadata.file).toBe(metadataFile);
          return {
            metadata: { name: metadata.name, symbol: metadata.symbol },
            metadataUri: "ipfs://blue-frog",
          };
        },
        createAndSnipeToken: async (input) => {
          expect(input).toMatchObject({
            mintKeypair,
            devAmount: 0.25,
            buyers: [
              { pk: "SECRET_BUYER_PK_1", amount: 0.2 },
              { pk: "SECRET_BUYER_PK_2", amount: 0.3 },
            ],
            isCashbackCoin: false,
            isTokenPregenerated: false,
          });
          return {
            createTxSignature: "create-signature",
            buyerTxSignatures: ["buyer-signature-1", "buyer-signature-2"],
            bundleIds: ["bundle-1"],
            paymentSignature: "payment-signature",
          };
        },
        bundleSellBuy: async () => {
          throw new Error("unused");
        },
      },
      prepared.packet.executorInput,
    );

    expect(result).toMatchObject({
      flow: "bundle_launch",
      mint: mintKeypair.publicKey.toBase58(),
      createTxSignature: "create-signature",
    });
    expect(JSON.stringify(result)).not.toMatch(secretValuePattern);
    expect(JSON.stringify(result)).not.toContain(descriptionBody);
  });

  it.each([
    ["missing preview", null, pendingPlan("bundle_launch"), boundary("browser-handoff-ready"), browserWalletRoster(), new Blob(), Keypair.generate(), "Bundle Launch preview is required."],
    ["missing pending plan", bundleLaunchPreview(), null, boundary("browser-handoff-ready"), browserWalletRoster(), new Blob(), Keypair.generate(), "Bundle Launch pending plan is required."],
    ["mock boundary", bundleLaunchPreview(), pendingPlan("bundle_launch"), boundary("mock"), browserWalletRoster(), new Blob(), Keypair.generate(), "Smithii browser handoff is not ready for this launch."],
    ["mismatched plan", { ...bundleLaunchPreview(), planId: "other_plan" }, pendingPlan("bundle_launch"), boundary("browser-handoff-ready"), browserWalletRoster(), new Blob(), Keypair.generate(), "Bundle Launch preview and pending plan do not match."],
    ["missing file", bundleLaunchPreview(), pendingPlan("bundle_launch"), boundary("browser-handoff-ready"), browserWalletRoster(), null, Keypair.generate(), "Bundle Launch metadata image file is required."],
    ["missing mint keypair", bundleLaunchPreview(), pendingPlan("bundle_launch"), boundary("browser-handoff-ready"), browserWalletRoster(), new Blob(), null, "Bundle Launch mint keypair is required."],
    ["missing dev wallet", bundleLaunchPreview(), pendingPlan("bundle_launch"), boundary("browser-handoff-ready"), browserWalletRoster().filter((wallet) => wallet.role !== "dev"), new Blob(), Keypair.generate(), "Browser dev wallet material is missing for DevWallet111."],
    ["missing buyer wallet", bundleLaunchPreview(), pendingPlan("bundle_launch"), boundary("browser-handoff-ready"), browserWalletRoster().filter((wallet) => wallet.pubkey !== "BuyerWallet222"), new Blob(), Keypair.generate(), "Browser bundle wallet material is missing for BuyerWallet222."],
  ])(
    "blocks packet preparation for %s",
    (_label, activePreview, pendingPlanValue, smithiiLive, walletRoster, metadataFile, mintKeypair, reason) => {
      expect(
        prepareBundleLaunchBrowserExecution({
          activePreview,
          pendingPlan: pendingPlanValue,
          smithiiLive,
          walletRoster,
          metadataFile,
          mintKeypair,
          nonce: "nonce-8g",
          now: new Date("2026-05-06T09:00:00.000Z"),
        }),
      ).toEqual({ status: "blocked", reason });
    },
  );

  it("blocks launch packets with no bundle buyer wallets", () => {
    expect(
      prepareBundleLaunchBrowserExecution({
        activePreview: { ...bundleLaunchPreview(), bundleWallets: [] },
        pendingPlan: pendingPlan("bundle_launch"),
        smithiiLive: boundary("browser-handoff-ready"),
        walletRoster: browserWalletRoster(),
        metadataFile: new Blob(),
        mintKeypair: Keypair.generate(),
        nonce: "nonce-8g",
        now: new Date("2026-05-06T09:00:00.000Z"),
      }),
    ).toEqual({
      status: "blocked",
      reason: "Bundle Launch has no buyer wallets to execute.",
    });
  });
});

type LaunchModifierOverrides = Partial<
  Extract<ActivePreview, { kind: "bundle_launch" }>["modifiers"]
>;

function bundleLaunchPreview(
  modifierOverrides: LaunchModifierOverrides = {},
): Extract<ActivePreview, { kind: "bundle_launch" }> {
  return {
    kind: "bundle_launch",
    planId: "plan_bundle_launch_2_1_50",
    token: "Blue Frog / BFROG",
    tokenName: "Blue Frog",
    tokenSymbol: "BFROG",
    description: descriptionBody,
    totalBuysSol: 0.5,
    serviceFeeSol: 0.1,
    devWalletFeesSol: 0.35,
    devWalletPubkey: "DevWallet111",
    bundleWallets: [
      { pubkey: "BuyerWallet111", buyAmountSol: 0.2 },
      { pubkey: "BuyerWallet222", buyAmountSol: 0.3 },
    ],
    imageFileName: "blue-frog.png",
    socialsEnabled: true,
    socials: {
      website: "https://bluefrog.example",
      twitter: "https://x.com/bluefrog",
    },
    modifiers: {
      cashbackCoin: true,
      useDifferentBlocks: true,
      pregenerateTokenAddress: true,
      ...modifierOverrides,
    },
    globalSettings,
    summary: "Bundle launch for BFROG with 2 bundle wallets.",
  };
}

function boundary(mode: SmithiiLiveBoundary["mode"]): SmithiiLiveBoundary {
  return {
    mode,
    serverExecution: "blocked",
    sdkPackage: "@smithii/sdk",
    sdkMethod: "PumpFunClient.createAndSnipeToken",
    browserRequiredSignerArgs: ["launch wallet signer material"],
    blockers: [],
    questionsForSmithii: [],
  };
}

function pendingPlan(tool: PendingPlan["tool"]): PendingPlan {
  return {
    id: tool === "bundle_launch" ? "plan_bundle_launch_2_1_50" : "plan_bundle_swap_2_abc",
    tool,
    createdAt: 1778058000000,
  };
}

function browserWalletRoster(): BrowserWalletEntry[] {
  return [
    {
      id: "dev",
      pubkey: "DevWallet111",
      privateKey: "SECRET_DEV_PK",
      solBalance: 1,
      tokenBalance: 0,
      pctOfSupply: 0,
      role: "dev",
    },
    {
      id: "buyer-1",
      pubkey: "BuyerWallet111",
      privateKey: "SECRET_BUYER_PK_1",
      solBalance: 1,
      tokenBalance: 0,
      pctOfSupply: 0,
      role: "bundle",
    },
    {
      id: "buyer-2",
      pubkey: "BuyerWallet222",
      privateKey: "SECRET_BUYER_PK_2",
      solBalance: 1,
      tokenBalance: 0,
      pctOfSupply: 0,
      role: "bundle",
    },
  ];
}
