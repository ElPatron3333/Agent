export type GlobalSettings = {
  speed: "fast" | "turbo";
  jitoTip: number | "default";
  mevProtection: boolean;
  slippagePct: number;
};

export type BundleSwapRouting = "pumpfun_bonding" | "pumpswap_amm";

export type BundleSwapPerTxOverrides = {
  slippagePct?: number;
  gas?: number;
  priority?: number;
  mevShield?: boolean;
};

export const VOLUME_BOT_SELL_STRATEGY_LEG_LIMIT = 1;

type VolumeBotSellStrategyLeg = {
  sellPct: { min: number; max: number };
  delaySeconds: { min: number; max: number };
};

export type BundleLaunchInput = {
  dex: "pumpfun";
  token: {
    name: string;
    symbol: string;
    description: string;
    imageFileName: string;
    socialsEnabled: boolean;
    socials?: {
      website?: string;
      telegram?: string;
      twitter?: string;
    };
  };
  modifiers: {
    cashbackCoin: boolean;
    useDifferentBlocks: boolean;
    pregenerateTokenAddress: boolean;
  };
  devWalletPubkey: string;
  bundleWallets: Array<{
    pubkey: string;
    buyAmountSol: number;
  }>;
  globalSettings: GlobalSettings;
};

export type BundleSwapInput = {
  direction: "sol_to_token" | "token_to_sol" | "token_to_token";
  fromToken: "SOL" | string;
  toToken: "SOL" | string;
  participatingWallets: Array<{
    pubkey: string;
    solBalance: number;
    tokenBalance: number;
  }>;
  quantityMode:
    | { type: "total"; totalSol: number }
    | { type: "fixed"; perTxSol: number }
    | { type: "random"; minSol: number; maxSol: number }
    | { type: "random_pct"; minPct: number; maxPct: number };
  txCount: number;
  txDelayBlocks: number;
  perTxOverrides?: BundleSwapPerTxOverrides;
  globalSettings: GlobalSettings;
};

type VolumeBotBaseInput = {
  volumeWalletPubkey: string;
  tokenAddress: string;
  makers: number;
  orderAmount: { minSol: number; maxSol: number };
  delaySeconds: { min: number; max: number };
  onPurchase: "auto_sell" | "return_to_wallet";
  sellTiming: "after_each" | "after_all";
  globalSettings: GlobalSettings;
};

type VolumeBotSellStrategy = {
  sellMode: "sell_strategy";
  sellStrategy: {
    legs: [VolumeBotSellStrategyLeg, ...VolumeBotSellStrategyLeg[]];
  };
};

type VolumeBotSellAll = {
  sellMode: "sell_100";
  sellStrategy?: never;
};

export type VolumeBotInput = VolumeBotBaseInput &
  (VolumeBotSellStrategy | VolumeBotSellAll);

export type VolumeBotStatus = {
  state: "running" | "paused" | "completed" | "failed";
  makersDone: number;
  volumeDoneSol: number;
  solConsumed: number;
};
