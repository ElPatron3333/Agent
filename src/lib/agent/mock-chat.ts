import {
  executeBundleLaunch,
  executeBundleSwap,
  executeVolumeBot,
  prepareBundleLaunch,
  prepareBundleSwap,
  prepareVolumeBot,
} from "@/lib/smithii/mock";
import { DEFAULT_GLOBAL_SETTINGS } from "@/lib/global-settings";
import type { GlobalSettings } from "@/lib/smithii/types";
import type { LaunchWalletSelection } from "@/lib/wallet-roster";

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  text: string;
};

export type PendingPlan = {
  id: string;
  tool: "bundle_launch" | "bundle_swap" | "volume_bot";
  createdAt: number;
  signature?: string;
};

export type BundleLaunchDraft = {
  tool: "bundle_launch";
  data: {
    tokenName?: string;
    symbol?: string;
    description?: string;
    walletCount?: number;
    solPerWallet?: number;
    imageFileName?: string;
    socialsEnabled?: boolean;
    socials?: {
      website?: string;
      telegram?: string;
      twitter?: string;
    };
    socialStep?: "website" | "telegram" | "twitter" | "done";
    cashbackCoin?: boolean;
    useDifferentBlocks?: boolean;
    pregenerateTokenAddress?: boolean;
  };
};

export type Draft = BundleLaunchDraft;

export type ActivePreview =
  | {
      kind: "bundle_launch";
      planId: string;
      token: string;
      totalBuysSol: number;
      serviceFeeSol: number;
      devWalletFeesSol: number;
      devWalletPubkey: string;
      bundleWallets: Array<{
        pubkey: string;
        buyAmountSol: number;
      }>;
      imageFileName: string;
      socialsEnabled: boolean;
      socials: {
        website?: string;
        telegram?: string;
        twitter?: string;
      };
      modifiers: {
        cashbackCoin: boolean;
        useDifferentBlocks: boolean;
        pregenerateTokenAddress: boolean;
      };
      globalSettings: GlobalSettings;
      summary: string;
    }
  | {
      kind: "bundle_swap";
      planId: string;
      routing: string;
      serviceFeeSol: number;
      walletCount: number;
      skippedWallets: number;
      globalSettings: GlobalSettings;
      summary: string;
    }
  | {
      kind: "volume_bot";
      botId: string;
      makers: number;
      serviceFeeSol: number;
      estimatedTotalFeesSol: number;
      globalSettings: GlobalSettings;
      summary: string;
    };

export type MockChatInput = {
  message: string;
  now?: number;
  pendingPlan?: PendingPlan | null;
  draft?: Draft | null;
  launchWalletSelection?: LaunchWalletSelection | null;
  globalSettings?: GlobalSettings | null;
};

export type MockChatResult = {
  assistantMessage: ChatMessage;
  pendingPlan: PendingPlan | null;
  activePreview: ActivePreview | null;
  executionStatus: string;
  draft: Draft | null;
};

const PLAN_TTL_MS = 5 * 60 * 1000;

export function handleMockChat({
  message,
  now = Date.now(),
  pendingPlan = null,
  draft = null,
  launchWalletSelection = null,
  globalSettings = null,
}: MockChatInput): MockChatResult {
  const normalized = message.trim().toLowerCase();
  const resolvedGlobalSettings = globalSettings ?? DEFAULT_GLOBAL_SETTINGS;

  if (draft?.tool === "bundle_launch") {
    return collectBundleLaunchField({
      draft,
      rawMessage: message.trim(),
      now,
      launchWalletSelection,
      globalSettings: resolvedGlobalSettings,
    });
  }

  if (isConfirmIntent(normalized)) {
    return executePendingPlan({ pendingPlan, now });
  }

  if (isVolumeIntent(normalized)) {
    return prepareVolumePreview(now, resolvedGlobalSettings);
  }

  if (isSwapIntent(normalized)) {
    return prepareSwapPreview(now, resolvedGlobalSettings);
  }

  if (isLaunchIntent(normalized)) {
    const draft = buildLaunchDraftFromIntent(message);
    if (draft.data.tokenName) {
      return askForLaunchField("What symbol should I use?", draft);
    }

    return {
      assistantMessage: {
        role: "assistant",
        text: "What token name should I use?",
      },
      pendingPlan: null,
      activePreview: null,
      executionStatus: "Collecting launch fields",
      draft,
    };
  }

  return {
    assistantMessage: {
      role: "assistant",
      text: "I can prepare a Bundle Launch, Bundle Swap, or Volume Bot preview. Tell me which flow you want to configure.",
    },
    pendingPlan,
    activePreview: null,
    executionStatus: pendingPlan ? "Waiting for confirm" : "Waiting for preview",
    draft,
  };
}

function executePendingPlan({
  pendingPlan,
  now,
}: {
  pendingPlan: PendingPlan | null;
  now: number;
}): MockChatResult {
  if (!pendingPlan) {
    return {
      assistantMessage: {
        role: "assistant",
        text: "There is no active preview to confirm. Ask me to prepare a launch, swap, or volume bot first.",
      },
      pendingPlan: null,
      activePreview: null,
      executionStatus: "Waiting for preview",
      draft: null,
    };
  }

  if (now - pendingPlan.createdAt > PLAN_TTL_MS) {
    return {
      assistantMessage: {
        role: "assistant",
        text: "That preview expired. Prepare it again before executing.",
      },
      pendingPlan: null,
      activePreview: null,
      executionStatus: "Preview expired",
      draft: null,
    };
  }

  if (pendingPlan.tool === "bundle_launch") {
    const execution = executeBundleLaunch({ planId: pendingPlan.id });

    return {
      assistantMessage: {
        role: "assistant",
        text: `Mock Bundle Launch executed. Mint: ${execution.mintAddress}.`,
      },
      pendingPlan: null,
      activePreview: null,
      executionStatus: `${execution.mintAddress.slice(0, 12)}... returned`,
      draft: null,
    };
  }

  if (pendingPlan.tool === "bundle_swap") {
    const execution = executeBundleSwap({ planId: pendingPlan.id });

    return {
      assistantMessage: {
        role: "assistant",
        text: `Mock Bundle Swap executed. Signature: ${execution.txSignature}.`,
      },
      pendingPlan: null,
      activePreview: null,
      executionStatus: "Mock swap signature returned",
      draft: null,
    };
  }

  if (pendingPlan.tool !== "volume_bot") {
    return {
      assistantMessage: {
        role: "assistant",
        text: "That preview is invalid. Prepare it again before executing.",
      },
      pendingPlan: null,
      activePreview: null,
      executionStatus: "Invalid preview",
      draft: null,
    };
  }

  const execution = executeVolumeBot({ botId: pendingPlan.id });

  return {
    assistantMessage: {
      role: "assistant",
      text: `Mock Volume Bot started. Run ID: ${execution.runId}.`,
    },
    pendingPlan: null,
    activePreview: null,
    executionStatus: `Volume bot ${execution.status}`,
    draft: null,
  };
}

function collectBundleLaunchField({
  draft,
  rawMessage,
  now,
  launchWalletSelection,
  globalSettings,
}: {
  draft: BundleLaunchDraft;
  rawMessage: string;
  now: number;
  launchWalletSelection: LaunchWalletSelection | null;
  globalSettings: GlobalSettings;
}): MockChatResult {
  const nextDraft: BundleLaunchDraft = {
    tool: "bundle_launch",
    data: { ...draft.data },
  };

  if (!nextDraft.data.tokenName) {
    nextDraft.data.tokenName = rawMessage;

    return askForLaunchField("What symbol should I use?", nextDraft);
  }

  if (!nextDraft.data.symbol) {
    nextDraft.data.symbol = rawMessage.toUpperCase();

    return askForLaunchField("Write a short description for the token.", nextDraft);
  }

  if (!nextDraft.data.description) {
    if (rawMessage.length > 250) {
      return askForLaunchField(
        "Description must be 250 characters or fewer.",
        nextDraft,
      );
    }

    nextDraft.data.description = rawMessage;

    return askForLaunchField(
      "How many bundle wallets should buy? Use 1-15.",
      nextDraft,
    );
  }

  if (!nextDraft.data.walletCount) {
    const walletCount = Number.parseInt(rawMessage, 10);
    if (
      !Number.isFinite(walletCount) ||
      !Number.isInteger(walletCount) ||
      walletCount < 1 ||
      walletCount > 15
    ) {
      return askForLaunchField(
        "Wallet count must be a whole number from 1 to 15.",
        nextDraft,
      );
    }

    nextDraft.data.walletCount = walletCount;

    return askForLaunchField(
      "How much SOL should each bundle wallet buy?",
      nextDraft,
    );
  }

  if (!nextDraft.data.solPerWallet) {
    const solPerWallet = Number.parseFloat(rawMessage);
    if (!Number.isFinite(solPerWallet) || solPerWallet <= 0) {
      return askForLaunchField(
        "SOL per wallet must be a number greater than 0.",
        nextDraft,
      );
    }

    nextDraft.data.solPerWallet = solPerWallet;

    return askForLaunchField(
      "What image filename should I use? Use a .png or .jpg placeholder.",
      nextDraft,
    );
  }

  if (!nextDraft.data.imageFileName) {
    if (!/\.(png|jpg|jpeg)$/i.test(rawMessage)) {
      return askForLaunchField(
        "Image filename must end in .png or .jpg.",
        nextDraft,
      );
    }

    nextDraft.data.imageFileName = rawMessage;

    return askForLaunchField("Add socials? Reply yes or no.", nextDraft);
  }

  if (nextDraft.data.socialsEnabled === undefined) {
    const enabled = parseYesNo(rawMessage);
    if (enabled === null) {
      return askForLaunchField("Reply yes or no for socials.", nextDraft);
    }

    nextDraft.data.socialsEnabled = enabled;
    if (!enabled) {
      return askForLaunchField(
        "Enable Cashback Coin? Reply yes or no.",
        nextDraft,
      );
    }

    nextDraft.data.socialStep = "website";

    return askForLaunchField("Website URL? Reply skip if none.", nextDraft);
  }

  if (
    nextDraft.data.socialsEnabled &&
    nextDraft.data.socialStep === "website"
  ) {
    const website = parseOptionalValue(rawMessage);
    if (website && !website.startsWith("https://")) {
      return askForLaunchField(
        "Website URL must start with https://.",
        nextDraft,
      );
    }

    nextDraft.data.socials = {
      ...nextDraft.data.socials,
      ...(website ? { website } : {}),
    };
    nextDraft.data.socialStep = "telegram";

    return askForLaunchField("Telegram URL? Reply skip if none.", nextDraft);
  }

  if (
    nextDraft.data.socialsEnabled &&
    nextDraft.data.socialStep === "telegram"
  ) {
    const telegram = parseOptionalValue(rawMessage);
    if (telegram && !telegram.startsWith("https://t.me/")) {
      return askForLaunchField(
        "Telegram URL must start with https://t.me/.",
        nextDraft,
      );
    }

    nextDraft.data.socials = {
      ...nextDraft.data.socials,
      ...(telegram ? { telegram } : {}),
    };
    nextDraft.data.socialStep = "twitter";

    return askForLaunchField("Twitter/X URL? Reply skip if none.", nextDraft);
  }

  if (
    nextDraft.data.socialsEnabled &&
    nextDraft.data.socialStep === "twitter"
  ) {
    const twitter = parseOptionalValue(rawMessage);
    if (twitter && !twitter.startsWith("https://x.com/")) {
      return askForLaunchField(
        "Twitter/X URL must start with https://x.com/.",
        nextDraft,
      );
    }

    nextDraft.data.socials = {
      ...nextDraft.data.socials,
      ...(twitter ? { twitter } : {}),
    };
    nextDraft.data.socialStep = "done";

    return askForLaunchField(
      "Enable Cashback Coin? Reply yes or no.",
      nextDraft,
    );
  }

  if (nextDraft.data.cashbackCoin === undefined) {
    const cashbackCoin = parseYesNo(rawMessage);
    if (cashbackCoin === null) {
      return askForLaunchField(
        "Reply yes or no for Cashback Coin.",
        nextDraft,
      );
    }

    nextDraft.data.cashbackCoin = cashbackCoin;

    return askForLaunchField("Use different blocks? Reply yes or no.", nextDraft);
  }

  if (nextDraft.data.useDifferentBlocks === undefined) {
    const useDifferentBlocks = parseYesNo(rawMessage);
    if (useDifferentBlocks === null) {
      return askForLaunchField(
        "Reply yes or no for different blocks.",
        nextDraft,
      );
    }

    nextDraft.data.useDifferentBlocks = useDifferentBlocks;

    return askForLaunchField(
      "Pregenerate token address? Reply yes or no.",
      nextDraft,
    );
  }

  if (nextDraft.data.pregenerateTokenAddress === undefined) {
    const pregenerateTokenAddress = parseYesNo(rawMessage);
    if (pregenerateTokenAddress === null) {
      return askForLaunchField(
        "Reply yes or no for pregenerate token address.",
        nextDraft,
      );
    }

    nextDraft.data.pregenerateTokenAddress = pregenerateTokenAddress;
  }

  return prepareLaunchPreview(
    now,
    requireCompleteBundleLaunchDraft(nextDraft),
    launchWalletSelection,
    globalSettings,
  );
}

function buildLaunchDraftFromIntent(message: string): BundleLaunchDraft {
  return {
    tool: "bundle_launch",
    data: {
      ...parseLaunchIntentTokenName(message),
      ...parseLaunchIntentWalletCount(message),
    },
  };
}

function parseLaunchIntentTokenName(message: string) {
  const match = message.match(
    /\b(?:called|named)\s+(.+?)(?:\s+with\b|\s+using\b|\s+for\b|$)/i,
  );
  if (!match?.[1]) {
    return {};
  }

  return {
    tokenName: match[1].trim().replace(/[.?!,;:]+$/, ""),
  };
}

function parseLaunchIntentWalletCount(message: string) {
  const match = message.match(/\b(\d{1,2})\s*[- ]?(?:bundle\s*)?wallets?\b/i);
  if (!match?.[1]) {
    return {};
  }

  const walletCount = Number.parseInt(match[1], 10);
  if (!Number.isInteger(walletCount) || walletCount < 1 || walletCount > 15) {
    return {};
  }

  return { walletCount };
}

function askForLaunchField(text: string, draft: BundleLaunchDraft): MockChatResult {
  return {
    assistantMessage: {
      role: "assistant",
      text,
    },
    pendingPlan: null,
    activePreview: null,
    executionStatus: "Collecting launch fields",
    draft,
  };
}

function prepareLaunchPreview(
  now: number,
  draft: RequiredBundleLaunchDraft,
  launchWalletSelection: LaunchWalletSelection | null,
  globalSettings: GlobalSettings,
): MockChatResult {
  const walletSelection =
    launchWalletSelection ??
    buildFallbackLaunchWalletSelection({
      walletCount: draft.data.walletCount,
      solPerWallet: draft.data.solPerWallet,
    });
  const plan = prepareBundleLaunch({
    dex: "pumpfun",
    token: {
      name: draft.data.tokenName,
      symbol: draft.data.symbol,
      description: draft.data.description,
      imageFileName: draft.data.imageFileName,
      socialsEnabled: draft.data.socialsEnabled,
      socials: draft.data.socials,
    },
    modifiers: {
      cashbackCoin: draft.data.cashbackCoin,
      useDifferentBlocks: draft.data.useDifferentBlocks,
      pregenerateTokenAddress: draft.data.pregenerateTokenAddress,
    },
    devWalletPubkey: walletSelection.devWalletPubkey,
    bundleWallets: walletSelection.bundleWallets,
    globalSettings,
  });

  return {
    assistantMessage: {
      role: "assistant",
      text: "Bundle Launch preview is ready. Type confirm or launch to execute the mock handoff.",
    },
    pendingPlan: {
      id: plan.planId,
      tool: "bundle_launch",
      createdAt: now,
    },
    activePreview: {
      kind: "bundle_launch",
      planId: plan.planId,
      token: `${draft.data.tokenName} / ${draft.data.symbol}`,
      totalBuysSol: plan.preview.totalBuysSol,
      serviceFeeSol: plan.preview.smithiiServiceFeeSol,
      devWalletFeesSol: plan.preview.feesFromDevWalletSol,
      devWalletPubkey: walletSelection.devWalletPubkey,
      bundleWallets: walletSelection.bundleWallets,
      imageFileName: draft.data.imageFileName,
      socialsEnabled: draft.data.socialsEnabled,
      socials: stripEmptySocials(draft.data.socials),
      modifiers: {
        cashbackCoin: draft.data.cashbackCoin,
        useDifferentBlocks: draft.data.useDifferentBlocks,
        pregenerateTokenAddress: draft.data.pregenerateTokenAddress,
      },
      globalSettings,
      summary: plan.preview.summaryMd,
    },
    executionStatus: "Waiting for confirm",
    draft: null,
  };
}

function requireCompleteBundleLaunchDraft(
  draft: BundleLaunchDraft,
): RequiredBundleLaunchDraft {
  const {
    tokenName,
    symbol,
    description,
    walletCount,
    solPerWallet,
    imageFileName,
    socialsEnabled,
    cashbackCoin,
    useDifferentBlocks,
    pregenerateTokenAddress,
  } = draft.data;

  if (
    !tokenName ||
    !symbol ||
    !description ||
    !walletCount ||
    !solPerWallet ||
    !imageFileName ||
    socialsEnabled === undefined ||
    cashbackCoin === undefined ||
    useDifferentBlocks === undefined ||
    pregenerateTokenAddress === undefined
  ) {
    throw new Error("Bundle Launch draft is incomplete.");
  }

  return {
    tool: "bundle_launch",
    data: {
      tokenName,
      symbol,
      description,
      walletCount,
      solPerWallet,
      imageFileName,
      socialsEnabled,
      socials: stripEmptySocials(draft.data.socials),
      cashbackCoin,
      useDifferentBlocks,
      pregenerateTokenAddress,
    },
  };
}

function prepareSwapPreview(
  now: number,
  globalSettings: GlobalSettings,
): MockChatResult {
  const plan = prepareBundleSwap({
    direction: "token_to_sol",
    fromToken: "SCATMint111",
    toToken: "SOL",
    participatingWallets: [
      { pubkey: "BndlWallet...4kd9", solBalance: 0.08, tokenBalance: 1200 },
      { pubkey: "BndlWallet...8qa2", solBalance: 0.06, tokenBalance: 900 },
      { pubkey: "BndlWallet...2mwp", solBalance: 0.03, tokenBalance: 0 },
    ],
    quantityMode: { type: "random_pct", minPct: 80, maxPct: 100 },
    txCount: 3,
    txDelayBlocks: 0,
    globalSettings,
  });
  const skippedWallets = plan.preview.perWallet.filter(
    (wallet) => wallet.status !== "ready",
  ).length;

  return {
    assistantMessage: {
      role: "assistant",
      text: "Bundle Swap preview is ready. Type confirm to execute the mock handoff.",
    },
    pendingPlan: {
      id: plan.planId,
      tool: "bundle_swap",
      createdAt: now,
    },
    activePreview: {
      kind: "bundle_swap",
      planId: plan.planId,
      routing: plan.preview.routing,
      serviceFeeSol: plan.preview.serviceFeeSol,
      walletCount: plan.preview.perWallet.length,
      skippedWallets,
      globalSettings,
      summary: plan.preview.summaryMd,
    },
    executionStatus: "Waiting for confirm",
    draft: null,
  };
}

function prepareVolumePreview(
  now: number,
  globalSettings: GlobalSettings,
): MockChatResult {
  const bot = prepareVolumeBot({
    volumeWalletPubkey: "VolumeWallet...5sTq",
    tokenAddress: "SCATMint111",
    makers: 100,
    orderAmount: { minSol: 0.01, maxSol: 0.02 },
    delaySeconds: { min: 10, max: 20 },
    onPurchase: "auto_sell",
    sellTiming: "after_each",
    sellMode: "sell_strategy",
    sellStrategy: {
      legs: [
        {
          sellPct: { min: 1, max: 33 },
          delaySeconds: { min: 10, max: 20 },
        },
      ],
    },
    globalSettings,
  });

  return {
    assistantMessage: {
      role: "assistant",
      text: "Volume Bot preview is ready. Type start or confirm to execute the mock handoff.",
    },
    pendingPlan: {
      id: bot.botId,
      tool: "volume_bot",
      createdAt: now,
    },
    activePreview: {
      kind: "volume_bot",
      botId: bot.botId,
      makers: 100,
      serviceFeeSol: bot.preview.smithiiServiceFeeSol,
      estimatedTotalFeesSol: bot.preview.estimatedTotalFeesSol,
      globalSettings,
      summary: bot.preview.summaryMd,
    },
    executionStatus: "Waiting for confirm",
    draft: null,
  };
}

type RequiredBundleLaunchDraft = {
  tool: "bundle_launch";
  data: {
    tokenName: string;
    symbol: string;
    description: string;
    walletCount: number;
    solPerWallet: number;
    imageFileName: string;
    socialsEnabled: boolean;
    socials: {
      website?: string;
      telegram?: string;
      twitter?: string;
    };
    cashbackCoin: boolean;
    useDifferentBlocks: boolean;
    pregenerateTokenAddress: boolean;
  };
};

function parseYesNo(value: string) {
  const normalized = value.trim().toLowerCase();
  if (["yes", "y", "true", "on"].includes(normalized)) {
    return true;
  }
  if (["no", "n", "false", "off"].includes(normalized)) {
    return false;
  }
  return null;
}

function parseOptionalValue(value: string) {
  const trimmed = value.trim();
  return trimmed.toLowerCase() === "skip" ? undefined : trimmed;
}

function stripEmptySocials(
  socials: BundleLaunchDraft["data"]["socials"],
): RequiredBundleLaunchDraft["data"]["socials"] {
  return {
    ...(socials?.website ? { website: socials.website } : {}),
    ...(socials?.telegram ? { telegram: socials.telegram } : {}),
    ...(socials?.twitter ? { twitter: socials.twitter } : {}),
  };
}

function buildFallbackLaunchWalletSelection({
  walletCount,
  solPerWallet,
}: {
  walletCount: number;
  solPerWallet: number;
}): LaunchWalletSelection {
  return {
    devWalletPubkey: "DevWallet...91nP",
    bundleWallets: Array.from({ length: walletCount }, (_, index) => ({
      pubkey: `BndlWallet...${index + 1}`,
      buyAmountSol: solPerWallet,
    })),
  };
}

function isConfirmIntent(message: string) {
  return /^(confirm|launch|start|go|yes|execute)$/.test(message);
}

function isLaunchIntent(message: string) {
  return /\b(launch|bundle launch|token)\b/.test(message);
}

function isSwapIntent(message: string) {
  return /\b(sell|swap|dump)\b/.test(message);
}

function isVolumeIntent(message: string) {
  return /\b(volume|market maker|makers)\b/.test(message);
}
