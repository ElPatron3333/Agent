import type {
  BundleLaunchInput,
  BundleSwapInput,
  LaunchVolumeSequenceInput,
  VolumeBotStatus,
  VolumeBotInput,
} from "./types";
import { VOLUME_BOT_SELL_STRATEGY_LEG_LIMIT } from "./types";
import { resolveMockBundleSwapRouting } from "./token-routing";

const BUNDLE_LAUNCH_SERVICE_FEE_SOL = 0.1;
const PREGENERATE_TOKEN_ADDRESS_FEE_SOL = 0.1;
const WALLET_BUFFER_SOL = 0.05;
const VOLUME_FEE_PER_100_MAKERS_SOL = 0.025;

function roundSol(value: number) {
  return Math.round(value * 1000000000) / 1000000000;
}

function amountId(value: number) {
  return Math.round(value * 100).toString();
}

function roundSeconds(value: number) {
  return Math.round(value * 10) / 10;
}

export function prepareBundleLaunch(input: BundleLaunchInput) {
  if (input.bundleWallets.length > 15) {
    throw new Error(
      "Bundle Launch supports 16 wallets total, including the dev wallet.",
    );
  }

  const totalBuysSol = roundSol(
    input.bundleWallets.reduce((sum, wallet) => sum + wallet.buyAmountSol, 0),
  );
  const pregenerateFeeSol = input.modifiers.pregenerateTokenAddress
    ? PREGENERATE_TOKEN_ADDRESS_FEE_SOL
    : 0;
  const feesFromDevWalletSol = roundSol(
    BUNDLE_LAUNCH_SERVICE_FEE_SOL + pregenerateFeeSol,
  );

  return {
    planId: `plan_bundle_launch_${input.bundleWallets.length}_${input.modifiers.pregenerateTokenAddress ? 1 : 0}_${amountId(totalBuysSol)}`,
    preview: {
      smithiiServiceFeeSol: BUNDLE_LAUNCH_SERVICE_FEE_SOL,
      pregenerateFeeSol,
      totalBuysSol,
      feesFromDevWalletSol,
      perWalletMinBalance: input.bundleWallets.map((wallet) => ({
        pubkey: wallet.pubkey,
        buySol: wallet.buyAmountSol,
        recommendedBalanceSol: roundSol(wallet.buyAmountSol + WALLET_BUFFER_SOL),
      })),
      summaryMd: `Bundle launch for ${input.token.symbol} with ${input.bundleWallets.length} bundle wallets.`,
    },
  };
}

export function prepareBundleSwap(input: BundleSwapInput) {
  if (input.participatingWallets.length > 20) {
    throw new Error("Bundle Swap supports a maximum of 20 participating wallets.");
  }

  const plannedAmountSolOrPct = plannedAmountForWallet(
    input.quantityMode,
    input.participatingWallets.length,
  );
  const plannedSolExposure = plannedSolExposureForWallet(
    input.quantityMode,
    input.participatingWallets.length,
  );
  const routing = resolveMockBundleSwapRouting({
    fromToken: input.fromToken,
    toToken: input.toToken,
  });

  return {
    planId: `plan_bundle_swap_${input.direction}_${input.participatingWallets.length}_${bundleSwapPlanHash(input)}`,
    preview: {
      serviceFeeSol: 0.1,
      estimatedIntervalS: roundSeconds(input.txDelayBlocks * 0.4),
      estimatedTotalS: roundSeconds(input.txDelayBlocks * input.txCount * 0.4),
      perWallet: input.participatingWallets.map((wallet) => ({
        pubkey: wallet.pubkey,
        solBalance: wallet.solBalance,
        tokenBalance: wallet.tokenBalance,
        plannedAmountSolOrPct,
        status: swapWalletStatus(input.direction, wallet, plannedSolExposure),
      })),
      routing,
      perTxOverrides: input.perTxOverrides ?? {},
      summaryMd: `Bundle swap ${input.fromToken} to ${input.toToken} across ${input.participatingWallets.length} wallets via ${routing}.`,
    },
  };
}

function plannedAmountForWallet(
  quantityMode: BundleSwapInput["quantityMode"],
  walletCount: number,
) {
  if (quantityMode.type === "random_pct") {
    return quantityMode.minPct;
  }
  if (quantityMode.type === "fixed") {
    return quantityMode.perTxSol;
  }
  if (quantityMode.type === "random") {
    return quantityMode.minSol;
  }

  return roundSol(quantityMode.totalSol / Math.max(walletCount, 1));
}

function plannedSolExposureForWallet(
  quantityMode: BundleSwapInput["quantityMode"],
  walletCount: number,
) {
  if (quantityMode.type === "fixed") {
    return quantityMode.perTxSol;
  }
  if (quantityMode.type === "random") {
    return quantityMode.maxSol;
  }
  if (quantityMode.type === "total") {
    return roundSol(quantityMode.totalSol / Math.max(walletCount, 1));
  }

  return 0;
}

function swapWalletStatus(
  direction: BundleSwapInput["direction"],
  wallet: BundleSwapInput["participatingWallets"][number],
  plannedSolExposure: number,
) {
  if (direction !== "sol_to_token" && wallet.tokenBalance <= 0) {
    return "skip_no_token" as const;
  }

  const requiredSol =
    direction === "sol_to_token"
      ? plannedSolExposure + WALLET_BUFFER_SOL
      : WALLET_BUFFER_SOL;

  if (wallet.solBalance < requiredSol) {
    return "skip_no_sol_for_fees" as const;
  }

  return "ready" as const;
}

function bundleSwapPlanHash(input: BundleSwapInput) {
  return hashString(
    JSON.stringify({
      direction: input.direction,
      fromToken: input.fromToken,
      toToken: input.toToken,
      participatingWallets: input.participatingWallets.map((wallet) => ({
        pubkey: wallet.pubkey,
        solBalance: wallet.solBalance,
        tokenBalance: wallet.tokenBalance,
      })),
      quantityMode: input.quantityMode,
      txCount: input.txCount,
      txDelayBlocks: input.txDelayBlocks,
      perTxOverrides: input.perTxOverrides ?? {},
    }),
  );
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

export function prepareVolumeBot(input: VolumeBotInput) {
  validateVolumeBotInput(input);

  const smithiiServiceFeeSol = roundSol(
    (input.makers / 100) * VOLUME_FEE_PER_100_MAKERS_SOL,
  );
  const averageOrderSol = (input.orderAmount.minSol + input.orderAmount.maxSol) / 2;
  const estimatedTradingBudgetSol = input.makers * averageOrderSol;

  return {
    botId: `bot_volume_${input.makers}_${input.tokenAddress}_${volumeBotPlanHash(input)}`,
    preview: {
      smithiiServiceFeeSol,
      estimatedTotalFeesSol: roundSol(
        estimatedTradingBudgetSol + smithiiServiceFeeSol,
      ),
      expectedDurationText: `${input.makers} makers, ${input.delaySeconds.min}-${input.delaySeconds.max}s delay`,
      summaryMd: `Volume bot for ${input.tokenAddress} with ${input.makers} makers.`,
    },
  };
}

export function prepareLaunchVolumeSequence(input: LaunchVolumeSequenceInput) {
  const launch = prepareBundleLaunch(input.launch);
  const volume = prepareVolumeBot(input.volume);
  const hash = hashString(
    JSON.stringify({
      templateId: input.template.id,
      delayMinutes: input.delayMinutes,
      launchPlanId: launch.planId,
      volumeBotId: volume.botId,
    }),
  );

  return {
    sequenceId: `sequence_launch_volume_${input.template.id}_${input.delayMinutes}_${hash}`,
    preview: {
      templateId: input.template.id,
      templateName: input.template.name,
      delayMinutes: input.delayMinutes,
      launch: {
        planId: launch.planId,
        totalBuysSol: launch.preview.totalBuysSol,
        serviceFeeSol: launch.preview.smithiiServiceFeeSol,
        bundleWalletCount: input.launch.bundleWallets.length,
        summaryMd: launch.preview.summaryMd,
      },
      volume: {
        botId: volume.botId,
        volumeWalletPubkey: input.volume.volumeWalletPubkey,
        makers: input.volume.makers,
        serviceFeeSol: volume.preview.smithiiServiceFeeSol,
        estimatedTotalFeesSol: volume.preview.estimatedTotalFeesSol,
        expectedDurationText: volume.preview.expectedDurationText,
        summaryMd: volume.preview.summaryMd,
      },
      summaryMd: `${input.template.name} sequence: launch first, then queue Volume Bot after ${input.delayMinutes} minutes.`,
    },
  };
}

function volumeBotPlanHash(input: VolumeBotInput) {
  return hashString(
    JSON.stringify({
      volumeWalletPubkey: input.volumeWalletPubkey,
      tokenAddress: input.tokenAddress,
      makers: input.makers,
      orderAmount: input.orderAmount,
      delaySeconds: input.delaySeconds,
      onPurchase: input.onPurchase,
      sellTiming: input.sellTiming,
      sellMode: input.sellMode,
      sellStrategy:
        input.sellMode === "sell_strategy" ? input.sellStrategy : undefined,
      globalSettings: input.globalSettings,
    }),
  );
}

function validateVolumeBotInput(input: VolumeBotInput) {
  if (!input.volumeWalletPubkey.trim()) {
    throw new Error("Volume Bot wallet public key is required.");
  }
  if (!input.tokenAddress.trim()) {
    throw new Error("Volume Bot token address is required.");
  }
  if (
    !Number.isInteger(input.makers) ||
    input.makers < 1 ||
    input.makers > 10000
  ) {
    throw new Error("Volume Bot makers must be a whole number from 1 to 10000.");
  }
  if (!isPositiveRange(input.orderAmount.minSol, input.orderAmount.maxSol)) {
    throw new Error("Volume Bot order amount must be a positive min/max SOL range.");
  }
  if (!isPositiveRange(input.delaySeconds.min, input.delaySeconds.max)) {
    throw new Error("Volume Bot delay must be a positive min/max second range.");
  }

  if (input.sellMode === "sell_strategy") {
    const legs = (input as { sellStrategy?: { legs?: typeof input.sellStrategy.legs } })
      .sellStrategy?.legs;

    if (!legs?.length) {
      throw new Error("Sell strategy is required when sell mode is sell_strategy.");
    }

    if (legs.length > VOLUME_BOT_SELL_STRATEGY_LEG_LIMIT) {
      throw new Error("Volume Bot Sell Strategy supports one leg in the MVP.");
    }

    for (const leg of legs) {
      if (
        !isPositiveRange(leg.sellPct.min, leg.sellPct.max) ||
        leg.sellPct.max > 100
      ) {
        throw new Error(
          "Volume Bot sell strategy percentages must be 1-100 min/max ranges.",
        );
      }
      if (!isPositiveRange(leg.delaySeconds.min, leg.delaySeconds.max)) {
        throw new Error(
          "Volume Bot sell strategy delays must be positive min/max second ranges.",
        );
      }
    }
  }
}

function isPositiveRange(min: number, max: number) {
  return (
    Number.isFinite(min) &&
    Number.isFinite(max) &&
    min > 0 &&
    max > 0 &&
    min <= max
  );
}

export function executeBundleLaunch({ planId }: { planId: string }) {
  return {
    mintAddress: "MockMint1111111111111111111111111111111111",
    txSignature: `MockBundleLaunchSignature_${planId}`,
  };
}

export function executeBundleSwap({ planId }: { planId: string }) {
  return {
    txSignature: `MockBundleSwapSignature_${planId}`,
    perWalletResults: [],
  };
}

export function executeVolumeBot({ botId }: { botId: string }) {
  return {
    runId: `run_${botId}`,
    status: "started" as const,
  };
}

export function executeLaunchVolumeSequence({ sequenceId }: { sequenceId: string }) {
  const queuedDelayMinutes = Number.parseInt(
    sequenceId.match(/^sequence_launch_volume_[a-z0-9_]+_(\d+)_/)?.[1] ?? "5",
    10,
  );

  return {
    mintAddress: "MockMint1111111111111111111111111111111111",
    launchTxSignature: `MockBundleLaunchSignature_${sequenceId}_launch`,
    queuedVolumeRunId: `queued_volume_${sequenceId}`,
    queuedDelayMinutes,
    status: "queued" as const,
  };
}

export function getVolumeBotStatus({ runId }: { runId: string }): VolumeBotStatus {
  const makers = Number.parseInt(
    runId.match(/run_bot_volume_(\d+)_/)?.[1] ?? "100",
    10,
  );
  const makersDone = Math.max(1, Math.floor(makers * 0.2));
  const volumeDoneSol = roundSol(makersDone * 0.015);

  return {
    state: "running",
    makersDone,
    volumeDoneSol,
    solConsumed: volumeDoneSol,
  };
}

export function pauseVolumeBot({ runId }: { runId: string }) {
  void runId;

  return {
    status: "paused" as const,
  };
}
