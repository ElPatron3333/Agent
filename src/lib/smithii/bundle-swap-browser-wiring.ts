import { PublicKey } from "@solana/web3.js";

import type { ActivePreview, PendingPlan } from "@/lib/agent/mock-chat";
import {
  createBrowserExecutionPlan,
  type BrowserExecutionPlan,
} from "@/lib/smithii/browser-handoff";
import type { SmithiiLiveBoundary } from "@/lib/smithii/live-boundary";
import type { PumpBundleSwapBrowserHandoffInput } from "@/lib/smithii/pump-browser-executor";
import type { BrowserWalletEntry } from "@/lib/wallet-roster";

type BundleSwapPreview = Extract<ActivePreview, { kind: "bundle_swap" }>;

type BundleSwapBrowserBlockedReadiness = {
  status: "blocked";
  reason: string;
};

type BundleSwapBrowserReadyReadiness = {
  status: "ready";
  packet: BundleSwapBrowserExecutionPacket;
};

export type BundleSwapBrowserExecutionReadiness =
  | BundleSwapBrowserBlockedReadiness
  | BundleSwapBrowserReadyReadiness;

export type BundleSwapBrowserExecutionPacket = {
  plan: BrowserExecutionPlan;
  executorInput: PumpBundleSwapBrowserHandoffInput;
};

export type BundleSwapBrowserExecutionSummary = {
  status: "Browser swap packet prepared";
  flow: "bundle_swap";
  planId: string;
  idempotencyKey: string;
  action: "buy" | "sell";
  pool: PumpBundleSwapBrowserHandoffInput["pool"];
  walletCount: number;
  amountCount: number;
  expectedFeesLamports: string;
};

export type BundleSwapBrowserExecutionInput = {
  activePreview: ActivePreview | null;
  pendingPlan: PendingPlan | null;
  smithiiLive: SmithiiLiveBoundary | null;
  walletRoster: BrowserWalletEntry[];
  feeWalletPubkey: string;
  nonce: string;
  now?: Date;
};

export function prepareBundleSwapBrowserExecution({
  activePreview,
  pendingPlan,
  smithiiLive,
  walletRoster,
  feeWalletPubkey,
  nonce,
  now = new Date(),
}: BundleSwapBrowserExecutionInput): BundleSwapBrowserExecutionReadiness {
  const validation = validateBundleSwapInputs({
    activePreview,
    pendingPlan,
    smithiiLive,
  });
  if (validation.status === "blocked") {
    return validation;
  }

  const preview = validation.preview;
  const pool = poolForRouting(preview.routing);
  if (!pool) {
    return blocked("Bundle Swap routing is not supported by Pump browser execution.");
  }

  const mint = mintForPreview(preview);
  if (!mint) {
    return blocked("Bundle Swap token mint is invalid.");
  }

  const readyWallets = preview.perWallet.filter((wallet) => wallet.status === "ready");
  if (readyWallets.length === 0) {
    return blocked("Bundle Swap has no ready wallets to execute.");
  }

  const privateKeys: string[] = [];
  const amounts: number[] = [];
  const publicWallets: string[] = [];

  for (const wallet of readyWallets) {
    const rosterWallet = walletRoster.find((entry) => entry.pubkey === wallet.pubkey);
    if (!rosterWallet?.privateKey.trim()) {
      return blocked(`Browser wallet material is missing for ${wallet.pubkey}.`);
    }

    privateKeys.push(rosterWallet.privateKey);
    amounts.push(wallet.plannedAmountSolOrPct);
    publicWallets.push(wallet.pubkey);
  }

  const expectedFeesLamports = Math.round(
    preview.serviceFeeSol * 1_000_000_000,
  ).toString();
  const plan = createBrowserExecutionPlan({
    flow: "bundle_swap",
    wallet: feeWalletPubkey,
    params: {
      sourcePlanId: pendingPlan!.id,
      direction: preview.direction,
      tokenMint: mint.toBase58(),
      routing: preview.routing,
      pool,
      walletPubkeys: publicWallets,
      amounts,
      txCount: preview.txCount,
      txDelayBlocks: preview.txDelayBlocks,
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
        mint,
        direction: preview.direction,
        pool,
        privKeys: privateKeys,
        amounts,
        now,
      },
    },
  };
}

export function bundleSwapBrowserExecutionSummary(
  packet: BundleSwapBrowserExecutionPacket,
): BundleSwapBrowserExecutionSummary {
  return {
    status: "Browser swap packet prepared",
    flow: "bundle_swap",
    planId: packet.plan.planId,
    idempotencyKey: packet.plan.idempotencyKey,
    action: packet.executorInput.direction === "sol_to_token" ? "buy" : "sell",
    pool: packet.executorInput.pool,
    walletCount: packet.executorInput.amounts.length,
    amountCount: packet.executorInput.amounts.length,
    expectedFeesLamports: packet.plan.expectedFeesLamports,
  };
}

function validateBundleSwapInputs({
  activePreview,
  pendingPlan,
  smithiiLive,
}: Pick<
  BundleSwapBrowserExecutionInput,
  "activePreview" | "pendingPlan" | "smithiiLive"
>): BundleSwapBrowserBlockedReadiness | { status: "ready"; preview: BundleSwapPreview } {
  if (!activePreview || activePreview.kind !== "bundle_swap") {
    return blocked("Bundle Swap preview is required.");
  }
  if (!pendingPlan || pendingPlan.tool !== "bundle_swap") {
    return blocked("Bundle Swap pending plan is required.");
  }
  if (activePreview.planId !== pendingPlan.id) {
    return blocked("Bundle Swap preview and pending plan do not match.");
  }
  if (smithiiLive?.mode !== "browser-handoff-ready") {
    return blocked("Smithii browser handoff is not ready for this swap.");
  }
  if (activePreview.direction === "token_to_token") {
    return blocked("Token-to-token Bundle Swap is not supported by Pump browser execution.");
  }

  return { status: "ready", preview: activePreview };
}

function mintForPreview(preview: BundleSwapPreview): PublicKey | null {
  const mint = preview.direction === "sol_to_token" ? preview.toToken : preview.fromToken;
  try {
    return new PublicKey(mint);
  } catch {
    return null;
  }
}

function poolForRouting(routing: string) {
  if (routing === "pumpfun_bonding") {
    return "pump" as const;
  }
  if (routing === "pumpswap_amm") {
    return "pump-amm" as const;
  }

  return null;
}

function blocked(reason: string): BundleSwapBrowserBlockedReadiness {
  return { status: "blocked", reason };
}