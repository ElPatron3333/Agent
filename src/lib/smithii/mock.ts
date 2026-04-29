import type {
  BundleLaunchInput,
  BundleSwapInput,
  VolumeBotInput,
} from "./types";

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

  const plannedAmountSolOrPct =
    input.quantityMode.type === "random_pct"
      ? input.quantityMode.minPct
      : input.quantityMode.type === "fixed"
        ? input.quantityMode.perTxSol
        : input.quantityMode.type === "random"
          ? input.quantityMode.minSol
          : input.quantityMode.totalSol;

  return {
    planId: `plan_bundle_swap_${input.direction}_${input.participatingWallets.length}`,
    preview: {
      serviceFeeSol: 0.1,
      estimatedIntervalS: input.txDelayBlocks * 0.4,
      estimatedTotalS: input.txDelayBlocks * input.txCount * 0.4,
      perWallet: input.participatingWallets.map((wallet) => ({
        pubkey: wallet.pubkey,
        solBalance: wallet.solBalance,
        tokenBalance: wallet.tokenBalance,
        plannedAmountSolOrPct,
        status:
          input.direction !== "sol_to_token" && wallet.tokenBalance <= 0
            ? ("skip_no_token" as const)
            : ("ready" as const),
      })),
      routing: "pumpfun_bonding" as const,
      summaryMd: `Bundle swap ${input.fromToken} to ${input.toToken} across ${input.participatingWallets.length} wallets.`,
    },
  };
}

export function prepareVolumeBot(input: VolumeBotInput) {
  if (
    input.sellMode === "sell_strategy" &&
    (!input.sellStrategy || input.sellStrategy.legs.length === 0)
  ) {
    throw new Error("Sell strategy is required when sell mode is sell_strategy.");
  }

  const smithiiServiceFeeSol = roundSol(
    (input.makers / 100) * VOLUME_FEE_PER_100_MAKERS_SOL,
  );
  const averageOrderSol = (input.orderAmount.minSol + input.orderAmount.maxSol) / 2;
  const estimatedTradingBudgetSol = input.makers * averageOrderSol;

  return {
    botId: `bot_volume_${input.makers}_${input.tokenAddress}`,
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
