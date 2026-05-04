import type {
  AntiMEVAmountConfig,
  AntiMEVDelayConfig,
  AntiMEVMultipleConfig,
  AntiMEVSingleConfig,
  AntiMEVVariant,
} from "@smithii/sdk/anti-mev";
import type {
  PumpBundleSellBuyArgs,
  PumpCreateAndSnipeArgs,
  PumpMetadataResponse,
  PumpSwapAction,
} from "@smithii/sdk/pump";
import { PublicKey, type Keypair } from "@solana/web3.js";

import { resolveMockBundleSwapRouting } from "./token-routing";
import type {
  BundleLaunchInput,
  BundleSwapInput,
  BundleSwapRouting,
  VolumeBotInput,
} from "./types";

export type SdkRuntime = "browser" | "server";

type IntegrationCoverage =
  | "direct_browser_only"
  | "partial_pending_smithii_confirmation";

type VolumeBotUnresolvedField =
  | "onPurchase"
  | "sellTiming"
  | "sellMode"
  | "sellStrategy";

export type VolumeBotAntiMevPlan = {
  client: "AntiMEVClient";
  method: "runSingle";
  variant: AntiMEVVariant;
  config: AntiMEVSingleConfig;
  coverage: "partial_pending_smithii_confirmation";
  disallowedAlternative: {
    method: "runMultiple";
    reason: string;
  };
  unresolvedFields: VolumeBotUnresolvedField[];
  questionsForSmithii: string[];
};

export const SMITHII_SDK_PACKAGE = {
  name: "@smithii/sdk",
  versionRange: "^0.2.0",
  subpaths: {
    pump: "@smithii/sdk/pump",
    pumpswap: "@smithii/sdk/pumpswap",
    antiMev: "@smithii/sdk/anti-mev",
    core: "@smithii/sdk/core",
    payment: "@smithii/sdk/payment",
  },
} as const;

export const SMITHII_SDK_ZERO_CUSTODY_RULES = {
  backendMayReceivePrivateKeys: false,
  browserOnlyPrivateKeyArgs: [
    "PumpFunClient.createAndSnipeToken buyers[].pk",
    "PumpFunClient.bundleSellBuy privKeys[]",
  ],
  disallowedBackendKeyFlows: [
    "AntiMEVClient.runMultiple privateKeys[] backend flow",
  ],
  signerOnlyFlows: ["AntiMEVClient.runSingle"],
} as const;

export function getSmithiiSdkIntegrationAssessment() {
  return {
    package: SMITHII_SDK_PACKAGE,
    zeroCustody: SMITHII_SDK_ZERO_CUSTODY_RULES,
    bundleLaunch: {
      sdkSubpath: SMITHII_SDK_PACKAGE.subpaths.pump,
      client: "PumpFunClient",
      method: "createAndSnipeToken",
      coverage: "direct_browser_only" as IntegrationCoverage,
      privateKeyArgs: ["buyers[].pk"],
    },
    bundleSwap: {
      sdkSubpath: SMITHII_SDK_PACKAGE.subpaths.pump,
      client: "PumpFunClient",
      method: "bundleSellBuy",
      coverage: "direct_browser_only" as IntegrationCoverage,
      privateKeyArgs: ["privKeys[]"],
      supportedDirections: ["sol_to_token", "token_to_sol"],
      unsupported: ["token_to_token"],
    },
    volumeBot: {
      sdkSubpath: SMITHII_SDK_PACKAGE.subpaths.antiMev,
      client: "AntiMEVClient",
      method: "runSingle",
      coverage: "partial_pending_smithii_confirmation" as IntegrationCoverage,
      blockedMethods: ["AntiMEVClient.runMultiple"],
      unresolvedFields: [
        "onPurchase",
        "sellTiming",
        "sellMode",
        "sellStrategy",
      ] as VolumeBotUnresolvedField[],
    },
  };
}

export function toPumpCreateAndSnipeArgs({
  runtime,
  input,
  metadata,
  mintKeypair,
  buyerPrivateKeys,
  devAmountSol = 0,
  referrer = null,
  plan = null,
}: {
  runtime: SdkRuntime;
  input: BundleLaunchInput;
  metadata: PumpMetadataResponse;
  mintKeypair: Keypair;
  buyerPrivateKeys: string[];
  devAmountSol?: number;
  referrer?: PublicKey | null;
  plan?: PublicKey | null;
}): PumpCreateAndSnipeArgs {
  assertBrowserOnlyPrivateKeys(runtime, buyerPrivateKeys, "Bundle Launch");

  if (buyerPrivateKeys.length !== input.bundleWallets.length) {
    throw new Error(
      "Bundle Launch buyer key count must match bundle wallet count.",
    );
  }

  return {
    mintKeypair,
    metadata,
    devAmount: devAmountSol,
    buyers: input.bundleWallets.map((wallet, index) => {
      const privateKey = buyerPrivateKeys[index];
      if (!privateKey) {
        throw new Error("Bundle Launch buyer private keys must be non-empty.");
      }
      return { pk: privateKey, amount: wallet.buyAmountSol };
    }),
    isTokenPregenerated: input.modifiers.pregenerateTokenAddress,
    isCashbackCoin: input.modifiers.cashbackCoin,
    referrer,
    plan,
  };
}

export function toPumpBundleSellBuyArgs({
  runtime,
  input,
  privateKeys,
  amounts,
  referrer = null,
  plan = null,
}: {
  runtime: SdkRuntime;
  input: BundleSwapInput;
  privateKeys: string[];
  amounts: number[];
  referrer?: PublicKey | null;
  plan?: PublicKey | null;
}): PumpBundleSellBuyArgs {
  assertBrowserOnlyPrivateKeys(runtime, privateKeys, "Bundle Swap");

  if (privateKeys.length !== input.participatingWallets.length) {
    throw new Error(
      "Bundle Swap private key count must match participating wallet count.",
    );
  }
  if (amounts.length !== input.participatingWallets.length) {
    throw new Error(
      "Bundle Swap amount count must match participating wallet count.",
    );
  }
  if (privateKeys.some((privateKey) => privateKey.trim().length === 0)) {
    throw new Error("Bundle Swap private keys must be non-empty.");
  }
  if (amounts.some((amount) => !Number.isFinite(amount) || amount <= 0)) {
    throw new Error("Bundle Swap amounts must be finite positive numbers.");
  }

  const target = pumpSwapTargetForInput(input);

  return {
    privKeys: privateKeys,
    amounts,
    mint: publicKeyFromString(target.mintAddress, "Bundle Swap mint"),
    action: target.action,
    pool: poolForRouting(target.routing),
    referrer,
    plan,
  };
}

export function pumpSwapTargetForInput(input: BundleSwapInput): {
  action: PumpSwapAction;
  mintAddress: string;
  routing: BundleSwapRouting;
} {
  if (input.direction === "token_to_token") {
    throw new Error(
      "@smithii/sdk/pump bundleSellBuy does not expose token-to-token swaps.",
    );
  }

  const action: PumpSwapAction = input.direction === "sol_to_token" ? "buy" : "sell";
  const mintAddress = action === "buy" ? input.toToken : input.fromToken;

  if (mintAddress === "SOL") {
    throw new Error("Bundle Swap target mint cannot be SOL.");
  }

  return {
    action,
    mintAddress,
    routing: resolveMockBundleSwapRouting({
      fromToken: input.fromToken,
      toToken: input.toToken,
    }),
  };
}

export function toAntiMevSinglePlan(
  input: VolumeBotInput,
  variant: AntiMEVVariant = "pump",
): VolumeBotAntiMevPlan {
  const unresolvedFields: VolumeBotUnresolvedField[] = [
    "onPurchase",
    "sellTiming",
    "sellMode",
  ];

  if (input.sellMode === "sell_strategy") {
    unresolvedFields.push("sellStrategy");
  }

  return {
    client: "AntiMEVClient",
    method: "runSingle",
    variant,
    config: {
      tokenAddress: input.tokenAddress,
      antiMEVUses: input.makers,
      amount: amountConfigForRange(input.orderAmount),
      delay: delayConfigForRange(input.delaySeconds),
    },
    coverage: "partial_pending_smithii_confirmation",
    disallowedAlternative: {
      method: "runMultiple",
      reason: "Requires privateKeys[] sent to Smithii backend.",
    },
    unresolvedFields,
    questionsForSmithii: [
      "Does AntiMEVClient.runSingle exactly power Pro Volume Bot or only Anti-MEV volume?",
      "Where do auto-sell, return-to-wallet, sell timing, and sell strategy map in SDK v0.2.0?",
      "Can Smithii provide a zero-custody multi-wallet Volume Bot flow, or is runMultiple intentionally backend-keyed?",
    ],
  };
}

export function rejectAntiMevRunMultipleForMvp(
  config: AntiMEVMultipleConfig,
): never {
  void config;
  throw new Error(
    "AntiMEVClient.runMultiple is blocked for this MVP because it sends privateKeys[] to the backend.",
  );
}

function amountConfigForRange(range: {
  minSol: number;
  maxSol: number;
}): AntiMEVAmountConfig {
  if (range.minSol === range.maxSol) {
    return { mode: "fixed", fixedAmount: range.minSol };
  }

  return {
    mode: "random",
    randomMin: range.minSol,
    randomMax: range.maxSol,
  };
}

function delayConfigForRange(range: {
  min: number;
  max: number;
}): AntiMEVDelayConfig {
  if (range.min === range.max) {
    return { mode: "fixed", fixedDelay: range.min };
  }

  return {
    mode: "random",
    randomMinDelay: range.min,
    randomMaxDelay: range.max,
  };
}

function assertBrowserOnlyPrivateKeys(
  runtime: SdkRuntime,
  privateKeys: string[],
  flowName: string,
) {
  if (runtime !== "browser" && privateKeys.length > 0) {
    throw new Error(
      flowName +
        " private keys must stay in the browser; backend SDK execution is not allowed for this flow.",
    );
  }
}

function poolForRouting(routing: BundleSwapRouting): PumpBundleSellBuyArgs["pool"] {
  return routing === "pumpswap_amm" ? "pump-amm" : "pump";
}

function publicKeyFromString(value: string, label: string): PublicKey {
  try {
    return new PublicKey(value);
  } catch {
    throw new Error(label + " must be a valid Solana public key.");
  }
}
