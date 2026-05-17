import type { Keypair } from "@solana/web3.js";

import type { ActivePreview, PendingPlan } from "@/lib/agent/mock-chat";
import {
  createBrowserExecutionPlan,
  type BrowserExecutionPlan,
} from "@/lib/smithii/browser-handoff";
import type { SmithiiLiveBoundary } from "@/lib/smithii/live-boundary";
import type { PumpBundleLaunchBrowserHandoffInput } from "@/lib/smithii/pump-browser-executor";
import type { BrowserWalletEntry } from "@/lib/wallet-roster";

type BundleLaunchPreview = Extract<ActivePreview, { kind: "bundle_launch" }>;

type BundleLaunchBrowserBlockedReadiness = {
  status: "blocked";
  reason: string;
};

type BundleLaunchBrowserReadyReadiness = {
  status: "ready";
  packet: BundleLaunchBrowserExecutionPacket;
};

export type BundleLaunchBrowserExecutionReadiness =
  | BundleLaunchBrowserBlockedReadiness
  | BundleLaunchBrowserReadyReadiness;

export type BundleLaunchBrowserExecutionPacket = {
  plan: BrowserExecutionPlan;
  executorInput: PumpBundleLaunchBrowserHandoffInput;
};

export type BundleLaunchBrowserExecutionSummary = {
  status: "Browser launch packet prepared";
  flow: "bundle_launch";
  planId: string;
  idempotencyKey: string;
  mint: string;
  devAmount: number;
  buyerCount: number;
  expectedFeesLamports: string;
  isTokenPregenerated: boolean;
  isCashbackCoin: boolean;
};

export type BundleLaunchBrowserExecutionInput = {
  activePreview: ActivePreview | null;
  pendingPlan: PendingPlan | null;
  smithiiLive: SmithiiLiveBoundary | null;
  walletRoster: BrowserWalletEntry[];
  metadataFile: Blob | File | null;
  mintKeypair: Keypair | null;
  nonce: string;
  now?: Date;
};

export function prepareBundleLaunchBrowserExecution({
  activePreview,
  pendingPlan,
  smithiiLive,
  walletRoster,
  metadataFile,
  mintKeypair,
  nonce,
  now = new Date(),
}: BundleLaunchBrowserExecutionInput): BundleLaunchBrowserExecutionReadiness {
  const validation = validateBundleLaunchInputs({
    activePreview,
    pendingPlan,
    smithiiLive,
  });
  if (validation.status === "blocked") {
    return validation;
  }

  if (!metadataFile) {
    return blocked("Bundle Launch metadata image file is required.");
  }
  if (!mintKeypair) {
    return blocked("Bundle Launch mint keypair is required.");
  }

  const preview = validation.preview;
  const devWallet = walletRoster.find((entry) => entry.pubkey === preview.devWalletPubkey);
  if (!devWallet?.privateKey.trim()) {
    return blocked(`Browser dev wallet material is missing for ${preview.devWalletPubkey}.`);
  }
  if (preview.bundleWallets.length === 0) {
    return blocked("Bundle Launch has no buyer wallets to execute.");
  }

  const buyers: PumpBundleLaunchBrowserHandoffInput["buyers"] = [];
  for (const wallet of preview.bundleWallets) {
    const rosterWallet = walletRoster.find((entry) => entry.pubkey === wallet.pubkey);
    if (!rosterWallet?.privateKey.trim()) {
      return blocked(`Browser bundle wallet material is missing for ${wallet.pubkey}.`);
    }

    buyers.push({ pk: rosterWallet.privateKey, amount: wallet.buyAmountSol });
  }

  const devAmount = preview.devAmountSol;
  const expectedFeesLamports = Math.round(
    preview.devWalletFeesSol * 1_000_000_000,
  ).toString();

  const plan = createBrowserExecutionPlan({
    flow: "bundle_launch",
    wallet: preview.devWalletPubkey,
    params: {
      sourcePlanId: pendingPlan!.id,
      tokenName: preview.tokenName,
      tokenSymbol: preview.tokenSymbol,
      imageFileName: preview.imageFileName,
      devWalletPubkey: preview.devWalletPubkey,
      bundleWalletPubkeys: preview.bundleWallets.map((wallet) => wallet.pubkey),
      bundleWalletAmounts: preview.bundleWallets.map((wallet) => wallet.buyAmountSol),
      modifiers: preview.modifiers,
      socials: preview.socials,
    },
    expectedFeesLamports,
    now,
    nonce,
  });

  return {
    status: "ready",
    packet: {
      plan,
      executorInput: {
        plan,
        metadata: {
          name: preview.tokenName,
          symbol: preview.tokenSymbol,
          description: preview.description,
          file: metadataFile,
          filename: preview.imageFileName,
          twitter: preview.socials.twitter ?? null,
          telegram: preview.socials.telegram ?? null,
          website: preview.socials.website ?? null,
        },
        mintKeypair,
        devAmount,
        buyers,
        isCashbackCoin: preview.modifiers.cashbackCoin,
        isTokenPregenerated: preview.modifiers.pregenerateTokenAddress,
        now,
      },
    },
  };
}

export function bundleLaunchBrowserExecutionSummary(
  packet: BundleLaunchBrowserExecutionPacket,
): BundleLaunchBrowserExecutionSummary {
  return {
    status: "Browser launch packet prepared",
    flow: "bundle_launch",
    planId: packet.plan.planId,
    idempotencyKey: packet.plan.idempotencyKey,
    mint: packet.executorInput.mintKeypair.publicKey.toBase58(),
    devAmount: packet.executorInput.devAmount,
    buyerCount: packet.executorInput.buyers.length,
    expectedFeesLamports: packet.plan.expectedFeesLamports,
    isTokenPregenerated: packet.executorInput.isTokenPregenerated,
    isCashbackCoin: packet.executorInput.isCashbackCoin,
  };
}

function validateBundleLaunchInputs({
  activePreview,
  pendingPlan,
  smithiiLive,
}: Pick<
  BundleLaunchBrowserExecutionInput,
  "activePreview" | "pendingPlan" | "smithiiLive"
>): BundleLaunchBrowserBlockedReadiness | { status: "ready"; preview: BundleLaunchPreview } {
  if (!activePreview || activePreview.kind !== "bundle_launch") {
    return blocked("Bundle Launch preview is required.");
  }
  if (!pendingPlan || pendingPlan.tool !== "bundle_launch") {
    return blocked("Bundle Launch pending plan is required.");
  }
  if (activePreview.planId !== pendingPlan.id) {
    return blocked("Bundle Launch preview and pending plan do not match.");
  }
  if (smithiiLive?.mode !== "browser-handoff-ready") {
    return blocked("Smithii browser handoff is not ready for this launch.");
  }

  return { status: "ready", preview: activePreview };
}

function blocked(reason: string): BundleLaunchBrowserBlockedReadiness {
  return { status: "blocked", reason };
}
