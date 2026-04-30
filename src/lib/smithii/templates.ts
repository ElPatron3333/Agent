import type { BundleLaunchInput, VolumeBotInput } from "./types";

export type LaunchVolumeTemplateId =
  | "stealth_v1"
  | "momentum_v1"
  | "slow_burn_v1";

export type LaunchVolumeTemplate = {
  id: LaunchVolumeTemplateId;
  name: string;
  launch: {
    buyAmountSol: number;
    modifiers: BundleLaunchInput["modifiers"];
  };
  volume: {
    makers: number;
    orderAmount: VolumeBotInput["orderAmount"];
    delaySeconds: VolumeBotInput["delaySeconds"];
    onPurchase: VolumeBotInput["onPurchase"];
    sellTiming: VolumeBotInput["sellTiming"];
    sellMode: "sell_100";
  };
};

export const LAUNCH_VOLUME_TEMPLATES = {
  stealth_v1: {
    id: "stealth_v1",
    name: "Stealth",
    launch: {
      buyAmountSol: 0.15,
      modifiers: {
        cashbackCoin: false,
        useDifferentBlocks: true,
        pregenerateTokenAddress: true,
      },
    },
    volume: {
      makers: 100,
      orderAmount: { minSol: 0.01, maxSol: 0.015 },
      delaySeconds: { min: 20, max: 40 },
      onPurchase: "auto_sell",
      sellTiming: "after_each",
      sellMode: "sell_100",
    },
  },
  momentum_v1: {
    id: "momentum_v1",
    name: "Momentum",
    launch: {
      buyAmountSol: 0.3,
      modifiers: {
        cashbackCoin: false,
        useDifferentBlocks: true,
        pregenerateTokenAddress: true,
      },
    },
    volume: {
      makers: 250,
      orderAmount: { minSol: 0.015, maxSol: 0.03 },
      delaySeconds: { min: 8, max: 18 },
      onPurchase: "auto_sell",
      sellTiming: "after_each",
      sellMode: "sell_100",
    },
  },
  slow_burn_v1: {
    id: "slow_burn_v1",
    name: "Slow Burn",
    launch: {
      buyAmountSol: 0.1,
      modifiers: {
        cashbackCoin: false,
        useDifferentBlocks: true,
        pregenerateTokenAddress: false,
      },
    },
    volume: {
      makers: 75,
      orderAmount: { minSol: 0.005, maxSol: 0.012 },
      delaySeconds: { min: 30, max: 60 },
      onPurchase: "return_to_wallet",
      sellTiming: "after_all",
      sellMode: "sell_100",
    },
  },
} satisfies Record<LaunchVolumeTemplateId, LaunchVolumeTemplate>;

export function launchVolumeTemplates() {
  return Object.values(LAUNCH_VOLUME_TEMPLATES);
}

export function templateForMessage(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("stealth")) {
    return LAUNCH_VOLUME_TEMPLATES.stealth_v1;
  }
  if (normalized.includes("slow burn") || normalized.includes("slow_burn")) {
    return LAUNCH_VOLUME_TEMPLATES.slow_burn_v1;
  }

  return LAUNCH_VOLUME_TEMPLATES.momentum_v1;
}
