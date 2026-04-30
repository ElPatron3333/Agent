import {
  executeBundleLaunch,
  executeBundleSwap,
  executeVolumeBot,
  getVolumeBotStatus,
  prepareBundleLaunch,
  prepareBundleSwap,
  prepareVolumeBot,
} from "@/lib/smithii/mock";
import { DEFAULT_GLOBAL_SETTINGS } from "@/lib/global-settings";
import { VOLUME_BOT_SELL_STRATEGY_LEG_LIMIT } from "@/lib/smithii/types";
import type {
  BundleSwapInput,
  BundleSwapPerTxOverrides,
  GlobalSettings,
  VolumeBotInput,
  VolumeBotStatus,
} from "@/lib/smithii/types";
import type {
  LaunchWalletSelection,
  SwapWalletSelection,
  VolumeWalletSelection,
} from "@/lib/wallet-roster";

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

export type BundleSwapDraft = {
  tool: "bundle_swap";
  data: {
    direction?: BundleSwapInput["direction"];
    fromToken?: string;
    toToken?: string;
    walletCount?: number;
    quantityMode?: BundleSwapInput["quantityMode"];
    pendingQuantityModeType?: BundleSwapInput["quantityMode"]["type"];
    txCount?: number;
    txDelayBlocks?: number;
    perTxOverrides?: BundleSwapPerTxOverrides;
  };
};

export type VolumeBotDraft = {
  tool: "volume_bot";
  data: {
    tokenAddress?: string;
    makers?: number;
    orderAmount?: VolumeBotInput["orderAmount"];
    delaySeconds?: VolumeBotInput["delaySeconds"];
    onPurchase?: VolumeBotInput["onPurchase"];
    sellTiming?: VolumeBotInput["sellTiming"];
    sellMode?: VolumeBotInput["sellMode"];
    sellStrategy?: Extract<
      VolumeBotInput,
      { sellMode: "sell_strategy" }
    >["sellStrategy"];
  };
};

export type Draft = BundleLaunchDraft | BundleSwapDraft | VolumeBotDraft;

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
      direction: BundleSwapInput["direction"];
      fromToken: string;
      toToken: string;
      routing: string;
      serviceFeeSol: number;
      walletCount: number;
      readyWallets: number;
      skippedWallets: number;
      quantityModeLabel: string;
      txCount: number;
      txDelayBlocks: number;
      estimatedIntervalS: number;
      estimatedTotalS: number;
      perTxOverrides: BundleSwapPerTxOverrides;
      perWallet: Array<{
        pubkey: string;
        solBalance: number;
        tokenBalance: number;
        plannedAmountSolOrPct: number;
        status: "ready" | "skip_no_token" | "skip_no_sol_for_fees";
      }>;
      globalSettings: GlobalSettings;
      summary: string;
    }
  | {
      kind: "volume_bot";
      botId: string;
      tokenAddress: string;
      volumeWalletPubkey: string;
      makers: number;
      orderAmount: VolumeBotInput["orderAmount"];
      delaySeconds: VolumeBotInput["delaySeconds"];
      onPurchase: VolumeBotInput["onPurchase"];
      sellTiming: VolumeBotInput["sellTiming"];
      sellMode: VolumeBotInput["sellMode"];
      sellStrategy?: Extract<
        VolumeBotInput,
        { sellMode: "sell_strategy" }
      >["sellStrategy"];
      serviceFeeSol: number;
      estimatedTotalFeesSol: number;
      expectedDurationText: string;
      globalSettings: GlobalSettings;
      summary: string;
    };

export type MockChatInput = {
  message: string;
  now?: number;
  pendingPlan?: PendingPlan | null;
  draft?: Draft | null;
  launchWalletSelection?: LaunchWalletSelection | null;
  swapWalletSelection?: SwapWalletSelection | null;
  volumeWalletSelection?: VolumeWalletSelection | null;
  globalSettings?: GlobalSettings | null;
};

export type VolumeBotRun = {
  runId: string;
  status: "started";
} & VolumeBotStatus;

export type MockChatResult = {
  assistantMessage: ChatMessage;
  pendingPlan: PendingPlan | null;
  activePreview: ActivePreview | null;
  executionStatus: string;
  draft: Draft | null;
  volumeBotRun?: VolumeBotRun;
};

const PLAN_TTL_MS = 5 * 60 * 1000;

export function handleMockChat({
  message,
  now = Date.now(),
  pendingPlan = null,
  draft = null,
  launchWalletSelection = null,
  swapWalletSelection = null,
  volumeWalletSelection = null,
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

  if (draft?.tool === "bundle_swap") {
    return collectBundleSwapField({
      draft,
      rawMessage: message.trim(),
      now,
      swapWalletSelection,
      globalSettings: resolvedGlobalSettings,
    });
  }

  if (draft?.tool === "volume_bot") {
    return collectVolumeBotField({
      draft,
      rawMessage: message.trim(),
      now,
      volumeWalletSelection,
      globalSettings: resolvedGlobalSettings,
    });
  }

  if (isConfirmIntent(normalized)) {
    return executePendingPlan({ pendingPlan, now });
  }

  if (isVolumeIntent(normalized)) {
    return askForVolumeField("What token address should the Volume Bot trade?", {
      tool: "volume_bot",
      data: {},
    });
  }

  if (isSwapIntent(normalized)) {
    const draft = buildSwapDraftFromIntent(message);
    if (isCompleteBundleSwapDraft(draft)) {
      return prepareSwapPreview(
        now,
        draft,
        swapWalletSelection,
        resolvedGlobalSettings,
      );
    }

    return askForSwapField(
      nextSwapPrompt(draft),
      draft,
    );
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
  const status = getVolumeBotStatus({ runId: execution.runId });

  return {
    assistantMessage: {
      role: "assistant",
      text: `Mock Volume Bot started. Run ID: ${execution.runId}.`,
    },
    pendingPlan: null,
    activePreview: null,
    executionStatus: `Volume bot ${execution.status}`,
    draft: null,
    volumeBotRun: {
      ...execution,
      ...status,
    },
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
    /\b(?:called|named)\s+(.+?)(?=\s+(?:with|using|for)\s+(?:a\s+|an\s+)?\d{1,2}\s*[- ]?(?:bundle\s*)?wallets?\b|$)/i,
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

function collectBundleSwapField({
  draft,
  rawMessage,
  now,
  swapWalletSelection,
  globalSettings,
}: {
  draft: BundleSwapDraft;
  rawMessage: string;
  now: number;
  swapWalletSelection: SwapWalletSelection | null;
  globalSettings: GlobalSettings;
}): MockChatResult {
  const nextDraft: BundleSwapDraft = {
    tool: "bundle_swap",
    data: { ...draft.data },
  };

  if (!nextDraft.data.direction) {
    const direction = parseSwapDirection(rawMessage);
    if (!direction) {
      return askForSwapField(
        "Reply buy, sell, or token to token for the swap direction.",
        nextDraft,
      );
    }
    nextDraft.data.direction = direction;

    return askForSwapField("What token should the swap start from?", nextDraft);
  }

  if (!nextDraft.data.fromToken) {
    nextDraft.data.fromToken = normalizeSwapToken(rawMessage);

    return askForSwapField("What token should the swap end with?", nextDraft);
  }

  if (!nextDraft.data.toToken) {
    nextDraft.data.toToken = normalizeSwapToken(rawMessage);

    return askForSwapField(
      "How many bundle wallets should participate? Use 1-20.",
      nextDraft,
    );
  }

  if (!nextDraft.data.walletCount) {
    const walletCount = Number.parseInt(rawMessage, 10);
    if (
      !Number.isInteger(walletCount) ||
      walletCount < 1 ||
      walletCount > 20
    ) {
      return askForSwapField(
        "Wallet count must be a whole number from 1 to 20.",
        nextDraft,
      );
    }
    nextDraft.data.walletCount = walletCount;

    return askForSwapField(
      "Which quantity mode should I use? Reply total, fixed, random, or random percent.",
      nextDraft,
    );
  }

  if (!nextDraft.data.quantityMode) {
    if (!nextDraft.data.pendingQuantityModeType) {
      const quantityModeType = parseQuantityModeType(rawMessage);
      if (!quantityModeType) {
        return askForSwapField(
          "Reply total, fixed, random, or random percent for quantity mode.",
          nextDraft,
        );
      }
      nextDraft.data.pendingQuantityModeType = quantityModeType;

      return askForSwapField(quantityAmountPrompt(quantityModeType), nextDraft);
    }

    const quantityMode = parseQuantityModeAmount(
      nextDraft.data.pendingQuantityModeType,
      rawMessage,
    );
    if (!quantityMode) {
      return askForSwapField(
        quantityAmountPrompt(nextDraft.data.pendingQuantityModeType),
        nextDraft,
      );
    }
    nextDraft.data.quantityMode = quantityMode;
    delete nextDraft.data.pendingQuantityModeType;

    return askForSwapField("How many transactions should Smithii create?", nextDraft);
  }

  if (!nextDraft.data.txCount) {
    const txCount = Number.parseInt(rawMessage, 10);
    if (!Number.isInteger(txCount) || txCount < 1 || txCount > 200) {
      return askForSwapField(
        "Transaction count must be a whole number from 1 to 200.",
        nextDraft,
      );
    }
    nextDraft.data.txCount = txCount;

    return askForSwapField("How many blocks should separate each transaction?", nextDraft);
  }

  if (nextDraft.data.txDelayBlocks === undefined) {
    const txDelayBlocks = Number.parseInt(rawMessage, 10);
    if (
      !Number.isInteger(txDelayBlocks) ||
      txDelayBlocks < 0 ||
      txDelayBlocks > 100
    ) {
      return askForSwapField(
        "TX delay blocks must be a whole number from 0 to 100.",
        nextDraft,
      );
    }
    nextDraft.data.txDelayBlocks = txDelayBlocks;

    return askForSwapField(
      "Any per-tx overrides? Example: slippage 7, gas 0.00001, priority 0.0002, mev off. Reply skip for defaults.",
      nextDraft,
    );
  }

  nextDraft.data.perTxOverrides = parsePerTxOverrides(rawMessage);

  return prepareSwapPreview(
    now,
    requireCompleteBundleSwapDraft(nextDraft),
    swapWalletSelection,
    globalSettings,
  );
}

function prepareSwapPreview(
  now: number,
  draft: RequiredBundleSwapDraft,
  swapWalletSelection: SwapWalletSelection | null,
  globalSettings: GlobalSettings,
): MockChatResult {
  const participatingWallets =
    swapWalletSelection?.participatingWallets.slice(0, draft.data.walletCount) ??
    buildFallbackSwapWalletSelection(draft.data.walletCount).participatingWallets;
  if (participatingWallets.length < draft.data.walletCount) {
    return askForSwapField(
      `I need ${draft.data.walletCount} participating bundle wallets before I can prepare this preview.`,
      draft,
    );
  }

  const plan = prepareBundleSwap({
    direction: draft.data.direction,
    fromToken: draft.data.fromToken,
    toToken: draft.data.toToken,
    participatingWallets,
    quantityMode: draft.data.quantityMode,
    txCount: draft.data.txCount,
    txDelayBlocks: draft.data.txDelayBlocks,
    perTxOverrides: draft.data.perTxOverrides,
    globalSettings,
  });
  const readyWallets = plan.preview.perWallet.filter(
    (wallet) => wallet.status === "ready",
  ).length;
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
      direction: draft.data.direction,
      fromToken: draft.data.fromToken,
      toToken: draft.data.toToken,
      routing: plan.preview.routing,
      serviceFeeSol: plan.preview.serviceFeeSol,
      walletCount: plan.preview.perWallet.length,
      readyWallets,
      skippedWallets,
      quantityModeLabel: quantityModeLabel(draft.data.quantityMode),
      txCount: draft.data.txCount,
      txDelayBlocks: draft.data.txDelayBlocks,
      estimatedIntervalS: plan.preview.estimatedIntervalS,
      estimatedTotalS: plan.preview.estimatedTotalS,
      perTxOverrides: plan.preview.perTxOverrides,
      perWallet: plan.preview.perWallet,
      globalSettings,
      summary: plan.preview.summaryMd,
    },
    executionStatus: "Waiting for confirm",
    draft: null,
  };
}

function collectVolumeBotField({
  draft,
  rawMessage,
  now,
  volumeWalletSelection,
  globalSettings,
}: {
  draft: VolumeBotDraft;
  rawMessage: string;
  now: number;
  volumeWalletSelection: VolumeWalletSelection | null;
  globalSettings: GlobalSettings;
}): MockChatResult {
  const nextDraft: VolumeBotDraft = {
    tool: "volume_bot",
    data: { ...draft.data },
  };

  if (!nextDraft.data.tokenAddress) {
    if (!rawMessage.trim()) {
      return askForVolumeField(
        "What token address should the Volume Bot trade?",
        nextDraft,
      );
    }
    nextDraft.data.tokenAddress = rawMessage.trim();

    return askForVolumeField("How many makers should I run? Use 1-10000.", nextDraft);
  }

  if (!nextDraft.data.makers) {
    const makers = Number.parseInt(rawMessage, 10);
    if (!Number.isInteger(makers) || makers < 1 || makers > 10000) {
      return askForVolumeField(
        "Maker count must be a whole number from 1 to 10000.",
        nextDraft,
      );
    }
    nextDraft.data.makers = makers;

    return askForVolumeField(
      "What SOL order amount range should I use? Example: 0.01 to 0.02.",
      nextDraft,
    );
  }

  if (!nextDraft.data.orderAmount) {
    const range = parseNumberRange(rawMessage);
    if (!range) {
      return askForVolumeField(
        "Order amount must be a positive SOL min/max range. Example: 0.01 to 0.02.",
        nextDraft,
      );
    }
    nextDraft.data.orderAmount = {
      minSol: range.min,
      maxSol: range.max,
    };

    return askForVolumeField(
      "What delay range should I use between orders? Example: 10 to 20 seconds.",
      nextDraft,
    );
  }

  if (!nextDraft.data.delaySeconds) {
    const range = parseNumberRange(rawMessage);
    if (!range) {
      return askForVolumeField(
        "Delay must be a positive min/max second range. Example: 10 to 20.",
        nextDraft,
      );
    }
    nextDraft.data.delaySeconds = {
      min: range.min,
      max: range.max,
    };

    return askForVolumeField(
      "After purchases, should Smithii auto sell or return tokens to wallet?",
      nextDraft,
    );
  }

  if (!nextDraft.data.onPurchase) {
    const onPurchase = parseVolumeOnPurchase(rawMessage);
    if (!onPurchase) {
      return askForVolumeField(
        "Reply auto sell or return to wallet for purchase handling.",
        nextDraft,
      );
    }
    nextDraft.data.onPurchase = onPurchase;

    return askForVolumeField("Sell after each purchase or after all purchases?", nextDraft);
  }

  if (!nextDraft.data.sellTiming) {
    const sellTiming = parseVolumeSellTiming(rawMessage);
    if (!sellTiming) {
      return askForVolumeField(
        "Reply after each or after all for sell timing.",
        nextDraft,
      );
    }
    nextDraft.data.sellTiming = sellTiming;

    return askForVolumeField(
      "Use sell strategy or sell 100? Reply sell strategy or sell 100.",
      nextDraft,
    );
  }

  if (!nextDraft.data.sellMode) {
    const sellMode = parseVolumeSellMode(rawMessage);
    if (!sellMode) {
      return askForVolumeField(
        "Reply sell strategy or sell 100 for sell mode.",
        nextDraft,
      );
    }
    nextDraft.data.sellMode = sellMode;

    if (sellMode === "sell_100") {
      return prepareVolumePreview(
        now,
        requireCompleteVolumeBotDraft(nextDraft),
        volumeWalletSelection,
        globalSettings,
      );
    }

    return askForVolumeField(
      "What sell strategy leg should I use? Example: 1 to 33 percent, 10 to 20 seconds.",
      nextDraft,
    );
  }

  if (nextDraft.data.sellMode === "sell_strategy" && !nextDraft.data.sellStrategy) {
    const strategyLeg = parseSellStrategyLeg(rawMessage);
    if (!strategyLeg) {
      return askForVolumeField(
        "Sell strategy leg must include percent and delay ranges. Example: 1 to 33 percent, 10 to 20 seconds.",
        nextDraft,
      );
    }
    nextDraft.data.sellStrategy = {
      legs: [strategyLeg],
    };
  }

  return prepareVolumePreview(
    now,
    requireCompleteVolumeBotDraft(nextDraft),
    volumeWalletSelection,
    globalSettings,
  );
}

function prepareVolumePreview(
  now: number,
  draft: RequiredVolumeBotDraft,
  volumeWalletSelection: VolumeWalletSelection | null,
  globalSettings: GlobalSettings,
): MockChatResult {
  if (!volumeWalletSelection) {
    return askForVolumeField(
      "Select a Volume Bot wallet before previewing.",
      draft,
    );
  }

  const { volumeWalletPubkey } = volumeWalletSelection;
  const input: VolumeBotInput =
    draft.data.sellMode === "sell_strategy"
      ? {
          volumeWalletPubkey,
          tokenAddress: draft.data.tokenAddress,
          makers: draft.data.makers,
          orderAmount: draft.data.orderAmount,
          delaySeconds: draft.data.delaySeconds,
          onPurchase: draft.data.onPurchase,
          sellTiming: draft.data.sellTiming,
          sellMode: "sell_strategy",
          sellStrategy: draft.data.sellStrategy,
          globalSettings,
        }
      : {
          volumeWalletPubkey,
          tokenAddress: draft.data.tokenAddress,
          makers: draft.data.makers,
          orderAmount: draft.data.orderAmount,
          delaySeconds: draft.data.delaySeconds,
          onPurchase: draft.data.onPurchase,
          sellTiming: draft.data.sellTiming,
          sellMode: "sell_100",
          globalSettings,
        };
  const bot = prepareVolumeBot(input);

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
      tokenAddress: draft.data.tokenAddress,
      volumeWalletPubkey,
      makers: draft.data.makers,
      orderAmount: draft.data.orderAmount,
      delaySeconds: draft.data.delaySeconds,
      onPurchase: draft.data.onPurchase,
      sellTiming: draft.data.sellTiming,
      sellMode: draft.data.sellMode,
      sellStrategy:
        draft.data.sellMode === "sell_strategy"
          ? draft.data.sellStrategy
          : undefined,
      serviceFeeSol: bot.preview.smithiiServiceFeeSol,
      estimatedTotalFeesSol: bot.preview.estimatedTotalFeesSol,
      expectedDurationText: bot.preview.expectedDurationText,
      globalSettings,
      summary: bot.preview.summaryMd,
    },
    executionStatus: "Waiting for confirm",
    draft: null,
  };
}

function askForVolumeField(text: string, draft: VolumeBotDraft): MockChatResult {
  return {
    assistantMessage: {
      role: "assistant",
      text,
    },
    pendingPlan: null,
    activePreview: null,
    executionStatus: "Collecting volume fields",
    draft,
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

type RequiredBundleSwapDraft = {
  tool: "bundle_swap";
  data: {
    direction: BundleSwapInput["direction"];
    fromToken: string;
    toToken: string;
    walletCount: number;
    quantityMode: BundleSwapInput["quantityMode"];
    txCount: number;
    txDelayBlocks: number;
    perTxOverrides: BundleSwapPerTxOverrides;
  };
};

type RequiredVolumeBotDraft = {
  tool: "volume_bot";
  data: {
    tokenAddress: string;
    makers: number;
    orderAmount: VolumeBotInput["orderAmount"];
    delaySeconds: VolumeBotInput["delaySeconds"];
    onPurchase: VolumeBotInput["onPurchase"];
    sellTiming: VolumeBotInput["sellTiming"];
  } & (
    | {
        sellMode: "sell_strategy";
        sellStrategy: Extract<
          VolumeBotInput,
          { sellMode: "sell_strategy" }
        >["sellStrategy"];
      }
    | {
        sellMode: "sell_100";
        sellStrategy?: never;
      }
  );
};

function buildSwapDraftFromIntent(message: string): BundleSwapDraft {
  const direction = parseSwapDirection(message);
  const quantityMode = parseQuantityModeFromIntent(message);
  const walletCount = parseSwapWalletCount(message);
  const inferredWalletCount = walletCount ?? (direction && quantityMode ? 3 : null);

  return {
    tool: "bundle_swap",
    data: {
      ...(direction ? { direction } : {}),
      ...(direction === "sol_to_token" ? { fromToken: "SOL" } : {}),
      ...(direction === "token_to_sol"
        ? { fromToken: "SCATMint111", toToken: "SOL" }
        : {}),
      ...(quantityMode ? { quantityMode } : {}),
      ...(inferredWalletCount ? { walletCount: inferredWalletCount } : {}),
      ...(direction && quantityMode
        ? { txCount: inferredWalletCount ?? 3, txDelayBlocks: 0, perTxOverrides: {} }
        : {}),
    },
  };
}

function askForSwapField(text: string, draft: BundleSwapDraft): MockChatResult {
  return {
    assistantMessage: {
      role: "assistant",
      text,
    },
    pendingPlan: null,
    activePreview: null,
    executionStatus: "Collecting swap fields",
    draft,
  };
}

function nextSwapPrompt(draft: BundleSwapDraft) {
  if (!draft.data.direction) {
    return "Which swap direction should I use? Reply buy, sell, or token to token.";
  }
  if (!draft.data.fromToken) {
    return "What token should the swap start from?";
  }
  if (!draft.data.toToken) {
    return "What token should the swap end with?";
  }
  if (!draft.data.walletCount) {
    return "How many bundle wallets should participate? Use 1-20.";
  }
  if (!draft.data.quantityMode) {
    return "Which quantity mode should I use? Reply total, fixed, random, or random percent.";
  }
  if (!draft.data.txCount) {
    return "How many transactions should Smithii create?";
  }
  if (draft.data.txDelayBlocks === undefined) {
    return "How many blocks should separate each transaction?";
  }

  return "Any per-tx overrides? Example: slippage 7, gas 0.00001, priority 0.0002, mev off. Reply skip for defaults.";
}

function isCompleteBundleSwapDraft(
  draft: BundleSwapDraft,
): draft is RequiredBundleSwapDraft {
  return (
    Boolean(draft.data.direction) &&
    Boolean(draft.data.fromToken) &&
    Boolean(draft.data.toToken) &&
    Boolean(draft.data.walletCount) &&
    Boolean(draft.data.quantityMode) &&
    Boolean(draft.data.txCount) &&
    draft.data.txDelayBlocks !== undefined
  );
}

function requireCompleteBundleSwapDraft(
  draft: BundleSwapDraft,
): RequiredBundleSwapDraft {
  if (!isCompleteBundleSwapDraft(draft)) {
    throw new Error("Bundle Swap draft is incomplete.");
  }

  return {
    tool: "bundle_swap",
    data: {
      direction: draft.data.direction,
      fromToken: draft.data.fromToken,
      toToken: draft.data.toToken,
      walletCount: draft.data.walletCount,
      quantityMode: draft.data.quantityMode,
      txCount: draft.data.txCount,
      txDelayBlocks: draft.data.txDelayBlocks,
      perTxOverrides: draft.data.perTxOverrides ?? {},
    },
  };
}

function requireCompleteVolumeBotDraft(
  draft: VolumeBotDraft,
): RequiredVolumeBotDraft {
  const {
    tokenAddress,
    makers,
    orderAmount,
    delaySeconds,
    onPurchase,
    sellTiming,
    sellMode,
    sellStrategy,
  } = draft.data;

  if (
    !tokenAddress ||
    !makers ||
    !orderAmount ||
    !delaySeconds ||
    !onPurchase ||
    !sellTiming ||
    !sellMode
  ) {
    throw new Error("Volume Bot draft is incomplete.");
  }

  if (sellMode === "sell_strategy") {
    if (
      !sellStrategy?.legs.length ||
      sellStrategy.legs.length > VOLUME_BOT_SELL_STRATEGY_LEG_LIMIT
    ) {
      throw new Error("Volume Bot draft is incomplete.");
    }

    return {
      tool: "volume_bot",
      data: {
        tokenAddress,
        makers,
        orderAmount,
        delaySeconds,
        onPurchase,
        sellTiming,
        sellMode,
        sellStrategy,
      },
    };
  }

  return {
    tool: "volume_bot",
    data: {
      tokenAddress,
      makers,
      orderAmount,
      delaySeconds,
      onPurchase,
      sellTiming,
      sellMode,
    },
  };
}

function parseSwapDirection(value: string): BundleSwapInput["direction"] | null {
  const normalized = value.trim().toLowerCase();
  if (/\b(buy|sol\s*(?:to|->)\s*token)\b/.test(normalized)) {
    return "sol_to_token";
  }
  if (/\b(sell|dump|token\s*(?:to|->)\s*sol)\b/.test(normalized)) {
    return "token_to_sol";
  }
  if (/\btoken\s*(?:to|->)\s*token\b/.test(normalized)) {
    return "token_to_token";
  }

  return null;
}

function normalizeSwapToken(value: string) {
  const trimmed = value.trim();
  return trimmed.toUpperCase() === "SOL" ? "SOL" : trimmed;
}

function parseSwapWalletCount(value: string) {
  const match = value.match(/\b(\d{1,2})\s*[- ]?(?:bundle\s*)?wallets?\b/i);
  if (!match?.[1]) {
    return null;
  }

  const walletCount = Number.parseInt(match[1], 10);
  return Number.isInteger(walletCount) && walletCount >= 1 && walletCount <= 20
    ? walletCount
    : null;
}

function parseQuantityModeType(
  value: string,
): BundleSwapInput["quantityMode"]["type"] | null {
  const normalized = value.trim().toLowerCase();
  if (/\brandom\s*(?:percent|pct|%)\b/.test(normalized)) {
    return "random_pct";
  }
  if (/\btotal\b/.test(normalized)) {
    return "total";
  }
  if (/\bfixed\b/.test(normalized)) {
    return "fixed";
  }
  if (/\brandom\b/.test(normalized)) {
    return "random";
  }

  return null;
}

function parseQuantityModeFromIntent(
  value: string,
): BundleSwapInput["quantityMode"] | null {
  const pctMatch = value.match(/\b(\d+(?:\.\d+)?)\s*(?:percent|pct|%)\b/i);
  if (pctMatch?.[1]) {
    const pct = Number.parseFloat(pctMatch[1]);
    if (Number.isFinite(pct) && pct > 0 && pct <= 100) {
      return { type: "random_pct", minPct: pct, maxPct: 100 };
    }
  }

  const solMatch = value.match(/\b(\d+(?:\.\d+)?)\s*sol\b/i);
  if (solMatch?.[1]) {
    const sol = Number.parseFloat(solMatch[1]);
    if (Number.isFinite(sol) && sol > 0) {
      return { type: "fixed", perTxSol: sol };
    }
  }

  return null;
}

function parseQuantityModeAmount(
  type: BundleSwapInput["quantityMode"]["type"],
  value: string,
): BundleSwapInput["quantityMode"] | null {
  const numbers = value
    .match(/\d+(?:\.\d+)?/g)
    ?.map((number) => Number.parseFloat(number))
    .filter((number) => Number.isFinite(number) && number > 0);

  if (!numbers?.length) {
    return null;
  }

  if (type === "total") {
    return { type, totalSol: numbers[0] };
  }
  if (type === "fixed") {
    return { type, perTxSol: numbers[0] };
  }
  if (type === "random" && numbers.length >= 2) {
    if (numbers[0] > numbers[1]) {
      return null;
    }
    return { type, minSol: numbers[0], maxSol: numbers[1] };
  }
  if (type === "random_pct" && numbers.length >= 2) {
    if (numbers[0] > numbers[1] || numbers[1] > 100) {
      return null;
    }
    return { type, minPct: numbers[0], maxPct: numbers[1] };
  }

  return null;
}

function quantityAmountPrompt(type: BundleSwapInput["quantityMode"]["type"]) {
  if (type === "total") {
    return "What total SOL amount should be split across the selected wallets?";
  }
  if (type === "fixed") {
    return "How much SOL should each transaction use?";
  }
  if (type === "random") {
    return "What random SOL range should I use? Example: 0.1 to 0.3.";
  }

  return "What random percent range should I use? Example: 80 to 100.";
}

function parsePerTxOverrides(value: string): BundleSwapPerTxOverrides {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === "skip" || normalized === "default") {
    return {};
  }

  return {
    ...numberOverride(value, "slippage", "slippagePct"),
    ...numberOverride(value, "gas", "gas"),
    ...numberOverride(value, "priority", "priority"),
    ...(normalized.includes("mev off")
      ? { mevShield: false }
      : normalized.includes("mev on")
        ? { mevShield: true }
        : {}),
  };
}

function parseNumberRange(value: string) {
  const numbers = value
    .match(/\d+(?:\.\d+)?/g)
    ?.map((number) => Number.parseFloat(number))
    .filter((number) => Number.isFinite(number) && number > 0);

  if (!numbers || numbers.length < 2 || numbers[0] > numbers[1]) {
    return null;
  }

  return {
    min: numbers[0],
    max: numbers[1],
  };
}

function parseVolumeOnPurchase(value: string): VolumeBotInput["onPurchase"] | null {
  const normalized = value.trim().toLowerCase();
  const autoSell = /\bauto\s*sell\b|\bsell\b/.test(normalized);
  const returnToWallet = /\breturn\b|\bwallet\b/.test(normalized);

  if (autoSell === returnToWallet) {
    return null;
  }
  if (autoSell) {
    return "auto_sell";
  }
  if (returnToWallet) {
    return "return_to_wallet";
  }

  return null;
}

function parseVolumeSellTiming(value: string): VolumeBotInput["sellTiming"] | null {
  const normalized = value.trim().toLowerCase();
  const afterEach = /\bafter\s*each\b|\beach\b/.test(normalized);
  const afterAll = /\bafter\s*all\b|\ball\b/.test(normalized);

  if (afterEach === afterAll) {
    return null;
  }
  if (afterEach) {
    return "after_each";
  }
  if (afterAll) {
    return "after_all";
  }

  return null;
}

function parseVolumeSellMode(value: string): VolumeBotInput["sellMode"] | null {
  const normalized = value.trim().toLowerCase();
  const sell100 = /\bsell\s*100\b|\b100%?\b|\ball\b/.test(normalized);
  const sellStrategy = /\bstrategy\b/.test(normalized);

  if (sell100 === sellStrategy) {
    return null;
  }
  if (sell100) {
    return "sell_100";
  }
  if (sellStrategy) {
    return "sell_strategy";
  }

  return null;
}

function parseSellStrategyLeg(
  value: string,
): Extract<VolumeBotInput, { sellMode: "sell_strategy" }>["sellStrategy"]["legs"][number] | null {
  const numbers = value
    .match(/\d+(?:\.\d+)?/g)
    ?.map((number) => Number.parseFloat(number))
    .filter((number) => Number.isFinite(number) && number > 0);

  if (!numbers || numbers.length < 4) {
    return null;
  }

  const [sellMin, sellMax, delayMin, delayMax] = numbers;
  if (sellMin > sellMax || sellMax > 100 || delayMin > delayMax) {
    return null;
  }

  return {
    sellPct: { min: sellMin, max: sellMax },
    delaySeconds: { min: delayMin, max: delayMax },
  };
}

function numberOverride<Key extends keyof BundleSwapPerTxOverrides>(
  value: string,
  label: string,
  key: Key,
): Pick<BundleSwapPerTxOverrides, Key> | Record<string, never> {
  const match = value.match(new RegExp(`${label}\\s+(\\d+(?:\\.\\d+)?)`, "i"));
  if (!match?.[1]) {
    return {};
  }

  return { [key]: Number.parseFloat(match[1]) } as Pick<
    BundleSwapPerTxOverrides,
    Key
  >;
}

function quantityModeLabel(quantityMode: BundleSwapInput["quantityMode"]) {
  if (quantityMode.type === "total") {
    return `Total ${quantityMode.totalSol} SOL`;
  }
  if (quantityMode.type === "fixed") {
    return `Fixed ${quantityMode.perTxSol} SOL per tx`;
  }
  if (quantityMode.type === "random") {
    return `Random ${quantityMode.minSol}-${quantityMode.maxSol} SOL`;
  }

  return `Random ${quantityMode.minPct}-${quantityMode.maxPct}%`;
}

function buildFallbackSwapWalletSelection(
  walletCount: number,
): SwapWalletSelection {
  const fallbackWallets = [
    { pubkey: "BndlWallet...4kd9", solBalance: 0.08, tokenBalance: 1200 },
    { pubkey: "BndlWallet...8qa2", solBalance: 0.06, tokenBalance: 900 },
    { pubkey: "BndlWallet...2mwp", solBalance: 0.03, tokenBalance: 0 },
    { pubkey: "BndlWallet...7xq1", solBalance: 0.08, tokenBalance: 0 },
  ];

  return {
    participatingWallets: fallbackWallets.slice(0, walletCount),
  };
}

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
  return /\b(sell|swap|dump|buy)\b/.test(message);
}

function isVolumeIntent(message: string) {
  return /\b(volume|market maker|makers)\b/.test(message);
}
