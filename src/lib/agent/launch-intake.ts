import type { PublicWalletRow } from "@/lib/wallet-roster";

export type LaunchIntakeWalletReference =
  | { kind: "index"; index: number; resolvedPubkey?: string }
  | { kind: "pubkey"; pubkey: string; resolvedPubkey?: string };

export type LaunchIntakeDraft = {
  tool: "launch_intake";
  data: {
    launchpad?: "pumpfun";
    tokenName?: string;
    symbol?: string;
    description?: string;
    imageFileName?: string;
    devWallet?: LaunchIntakeWalletReference;
    devAmountSol?: number;
    requestedBundleWalletCount?: number;
    bundleAllocations: Array<{
      wallet: LaunchIntakeWalletReference;
      buyAmountSol: number;
    }>;
    socials: {
      website?: string;
      telegram?: string;
      twitter?: string;
      github?: string;
    };
    socialsSkipped: boolean;
    walletIndexesUsed: boolean;
  };
};

export type LaunchIntakePreviewInput = {
  tokenName: string;
  symbol: string;
  description: string;
  imageFileName: string;
  devWalletPubkey: string;
  devAmountSol: number;
  bundleWallets: Array<{ pubkey: string; buyAmountSol: number }>;
  socialsSkipped: boolean;
  socials: {
    website?: string;
    telegram?: string;
    twitter?: string;
    github?: string;
  };
};

export type LaunchIntakeAdvanceInput = {
  draft: LaunchIntakeDraft | null;
  message: string;
  walletRows: PublicWalletRow[];
  uploadedImageFileName: string | null;
};

export type LaunchIntakeAdvanceResult = {
  draft: LaunchIntakeDraft;
  ready: boolean;
  prompt: string;
};

const IMAGE_REQUIRED_PROMPT =
  "I have the launch details, but I need the token image before I can prepare the preview. Upload the image, then I will continue.";
const SOCIALS_PROMPT =
  "Social links are optional. Send website, Telegram, X, GitHub, or reply skip.";

export function advanceLaunchIntake({
  draft,
  message,
  walletRows,
  uploadedImageFileName,
}: LaunchIntakeAdvanceInput): LaunchIntakeAdvanceResult {
  const nextDraft = mergeMessageIntoDraft(
    draft ? cloneDraft(draft) : emptyDraft(),
    message,
    walletRows,
    uploadedImageFileName,
    Boolean(draft),
  );
  resolveDraftWallets(nextDraft, walletRows);

  const prompt = nextPrompt(nextDraft, walletRows);
  return {
    draft: nextDraft,
    ready: prompt === null,
    prompt: prompt ?? readyPrompt(nextDraft),
  };
}

export function launchIntakePreviewInput(
  draft: LaunchIntakeDraft,
): LaunchIntakePreviewInput {
  const { data } = draft;
  if (
    data.launchpad !== "pumpfun" ||
    !data.tokenName ||
    !data.symbol ||
    !data.description ||
    !data.imageFileName ||
    !data.devWallet?.resolvedPubkey ||
    !data.devAmountSol ||
    !data.requestedBundleWalletCount ||
    data.bundleAllocations.length !== data.requestedBundleWalletCount ||
    (!data.socialsSkipped && Object.keys(stripEmptySocials(data.socials)).length === 0)
  ) {
    throw new Error("Launch intake is incomplete.");
  }

  const bundleWallets = data.bundleAllocations.map((allocation) => {
    if (!allocation.wallet.resolvedPubkey || allocation.buyAmountSol <= 0) {
      throw new Error("Launch intake is incomplete.");
    }

    return {
      pubkey: allocation.wallet.resolvedPubkey,
      buyAmountSol: allocation.buyAmountSol,
    };
  });
  const bundlePubkeys = new Set(bundleWallets.map((wallet) => wallet.pubkey));
  if (
    bundlePubkeys.size !== bundleWallets.length ||
    bundlePubkeys.has(data.devWallet.resolvedPubkey)
  ) {
    throw new Error("Launch intake is incomplete.");
  }

  return {
    tokenName: data.tokenName,
    symbol: data.symbol,
    description: data.description,
    imageFileName: data.imageFileName,
    devWalletPubkey: data.devWallet.resolvedPubkey,
    devAmountSol: data.devAmountSol,
    bundleWallets,
    socialsSkipped: data.socialsSkipped,
    socials: stripEmptySocials(data.socials),
  };
}

function emptyDraft(): LaunchIntakeDraft {
  return {
    tool: "launch_intake",
    data: {
      bundleAllocations: [],
      socials: {},
      socialsSkipped: false,
      walletIndexesUsed: false,
    },
  };
}

function cloneDraft(draft: LaunchIntakeDraft): LaunchIntakeDraft {
  return {
    tool: "launch_intake",
    data: {
      ...draft.data,
      devWallet: draft.data.devWallet ? { ...draft.data.devWallet } : undefined,
      bundleAllocations: draft.data.bundleAllocations.map((allocation) => ({
        wallet: { ...allocation.wallet },
        buyAmountSol: allocation.buyAmountSol,
      })),
      socials: { ...draft.data.socials },
    },
  };
}

function mergeMessageIntoDraft(
  draft: LaunchIntakeDraft,
  message: string,
  walletRows: PublicWalletRow[],
  uploadedImageFileName: string | null,
  isContinuation: boolean,
) {
  const data = draft.data;
  const trimmed = message.trim();
  const normalized = trimmed.toLowerCase();

  if (/pump\s*\.?(?:fun)?|pumpfun/.test(normalized)) {
    data.launchpad = "pumpfun";
  }
  data.launchpad ??= "pumpfun";

  data.tokenName ??= parseTokenName(trimmed);
  data.symbol ??= parseSymbol(trimmed) ?? inferSymbol(data.tokenName);
  data.description ??= parseDescription(trimmed);
  data.requestedBundleWalletCount ??= parseBundleWalletCount(trimmed);

  const devWallet = parseDevWallet(trimmed, walletRows);
  if (devWallet.wallet) {
    data.devWallet = devWallet.wallet;
  }
  if (devWallet.amountSol) {
    data.devAmountSol = devWallet.amountSol;
  }

  for (const allocation of parseBundleAllocations(trimmed, data.devWallet, walletRows)) {
    upsertAllocation(data.bundleAllocations, allocation);
  }

  const socials = parseSocials(trimmed);
  data.socials = { ...data.socials, ...socials };
  if (Object.keys(socials).length > 0) {
    data.socialsSkipped = false;
  }
  if (isSocialsSkip(trimmed)) {
    data.socialsSkipped = true;
  }
  if (uploadedImageFileName?.trim()) {
    data.imageFileName = uploadedImageFileName.trim();
  }
  if (isContinuation) {
    mergeDirectReplyIntoDraft(draft, trimmed, walletRows);
  }

  data.walletIndexesUsed =
    data.walletIndexesUsed ||
    data.devWallet?.kind === "index" ||
    data.bundleAllocations.some((allocation) => allocation.wallet.kind === "index");

  return draft;
}

function mergeDirectReplyIntoDraft(
  draft: LaunchIntakeDraft,
  message: string,
  walletRows: PublicWalletRow[],
) {
  if (!message || isSocialsSkip(message)) {
    return;
  }

  const data = draft.data;
  if (!data.tokenName) {
    data.tokenName = message;
    data.symbol ??= inferSymbol(data.tokenName);
    return;
  }
  if (!data.symbol) {
    data.symbol = parseSymbolValue(message) ?? data.symbol;
    return;
  }
  if (!data.description) {
    data.description = cleanText(message);
    return;
  }
  if (!data.devWallet) {
    data.devWallet = parseWalletReferenceReply(message, walletRows) ?? data.devWallet;
    return;
  }
  if (!data.devAmountSol) {
    data.devAmountSol = parseDirectSolAmount(message) ?? data.devAmountSol;
    return;
  }
  if (!data.requestedBundleWalletCount) {
    data.requestedBundleWalletCount = parseDirectBundleWalletCount(message) ??
      data.requestedBundleWalletCount;
    return;
  }

  const missingBuy = directMissingBuyAllocation(draft, walletRows, message);
  if (missingBuy) {
    upsertAllocation(data.bundleAllocations, missingBuy);
  }
}

function resolveDraftWallets(draft: LaunchIntakeDraft, walletRows: PublicWalletRow[]) {
  if (draft.data.devWallet) {
    draft.data.devWallet = resolveWalletReference(draft.data.devWallet, walletRows);
  }
  draft.data.bundleAllocations = draft.data.bundleAllocations.map((allocation) => ({
    ...allocation,
    wallet: resolveWalletReference(allocation.wallet, walletRows),
  }));
}

function nextPrompt(draft: LaunchIntakeDraft, walletRows: PublicWalletRow[]) {
  const unknownIndex = unresolvedIndexReference(draft);
  if (unknownIndex) {
    return `Wallet ${unknownIndex} maps to the imported wallet table, but only ${walletRows.length} wallets are loaded. Import the wallet CSV or reference an exact wallet address.`;
  }

  const unknownPubkey = unresolvedPubkeyReference(draft);
  if (unknownPubkey) {
    return `Wallet address ${unknownPubkey} is not imported. Import the wallet CSV or reference wallet indexes from the table.`;
  }

  const data = draft.data;
  if (!data.tokenName) {
    return "What token name should I use?";
  }
  if (!data.symbol) {
    return "What token symbol should I use?";
  }
  if (!data.description) {
    return "What description should I use?";
  }
  if (!data.devWallet?.resolvedPubkey) {
    return "Which imported wallet is the dev wallet? Use wallet number or public key.";
  }
  if (!data.devAmountSol) {
    return "How much SOL should the dev wallet use for token creation?";
  }
  if (!data.requestedBundleWalletCount) {
    return "How many bundle wallets should buy?";
  }

  const duplicate = data.bundleAllocations.find(
    (allocation) =>
      allocation.wallet.resolvedPubkey === data.devWallet?.resolvedPubkey,
  );
  if (duplicate) {
    return `The dev wallet cannot also be a bundle wallet. Which bundle wallet should buy ${duplicate.buyAmountSol} SOL instead?`;
  }

  const duplicateBundleWallet = duplicateBundleWalletAllocation(draft);
  if (duplicateBundleWallet) {
    return `Bundle wallet ${duplicateBundleWallet.pubkey} was provided more than once. Which imported wallet should buy ${duplicateBundleWallet.buyAmountSol} SOL instead?`;
  }

  const missingBuyPrompt = missingBundleBuyPrompt(draft, walletRows);
  if (missingBuyPrompt) {
    return missingBuyPrompt;
  }

  if (!data.imageFileName) {
    return IMAGE_REQUIRED_PROMPT;
  }

  if (!data.socialsSkipped && Object.keys(stripEmptySocials(data.socials)).length === 0) {
    return SOCIALS_PROMPT;
  }

  try {
    launchIntakePreviewInput(draft);
    return null;
  } catch {
    return "I need the remaining launch details before I can prepare the preview.";
  }
}

function parseTokenName(message: string) {
  const match = message.match(
    /\b(?:called|named)\s+(.+?)(?=\s+(?:symbol|ticker|on\s+pump|description\s*:|bundle\b|wallet\s+\d+\b|dev\s+wallet\b|website\b|github\b|telegram\b|twitter\b|x\b)|[.?!]|$)/i,
  );
  return cleanText(match?.[1]);
}

function duplicateBundleWalletAllocation(draft: LaunchIntakeDraft) {
  const seen = new Set<string>();
  for (const allocation of draft.data.bundleAllocations) {
    const pubkey = allocation.wallet.resolvedPubkey;
    if (!pubkey) {
      continue;
    }
    if (seen.has(pubkey)) {
      return { pubkey, buyAmountSol: allocation.buyAmountSol };
    }
    seen.add(pubkey);
  }
  return null;
}

function parseSymbol(message: string) {
  const match = message.match(/\b(?:symbol|ticker)\s+\$?([a-z0-9]{2,10})\b/i);
  return match?.[1]?.toUpperCase();
}

function parseSymbolValue(message: string) {
  const explicit = parseSymbol(message);
  if (explicit) {
    return explicit;
  }

  const compact = message.trim().replace(/^\$/, "").toUpperCase();
  return /^[A-Z0-9]{2,10}$/.test(compact) ? compact : undefined;
}

function parseDescription(message: string) {
  const match = message.match(
    /\bdescription\s*:\s*(.+?)(?=\s+(?:bundle\b|wallet\s+\d+\b|dev\s+wallet\b|website\b|telegram\b|github\b|twitter\b|skip\s+socials\b|no\s+socials\b|without\s+socials\b)|$)/i,
  );
  return cleanText(match?.[1]);
}

function parseBundleWalletCount(message: string) {
  const match =
    message.match(/\bbundle(?:\s+it)?\s+with\s+(\d{1,2})\s*(?:bundle\s*)?wallets?\b/i) ??
    message.match(/\b(\d{1,2})\s+bundle\s+wallets?\b/i);
  if (!match?.[1]) {
    return undefined;
  }
  const count = Number.parseInt(match[1], 10);
  return Number.isInteger(count) && count >= 1 && count <= 15 ? count : undefined;
}

function parseDirectBundleWalletCount(message: string) {
  const match = message.trim().match(/^(\d{1,2})(?:\s+(?:bundle\s*)?wallets?)?$/i);
  if (!match?.[1]) {
    return undefined;
  }
  const count = Number.parseInt(match[1], 10);
  return Number.isInteger(count) && count >= 1 && count <= 15 ? count : undefined;
}

function parseWalletReferenceReply(
  message: string,
  walletRows: PublicWalletRow[],
): LaunchIntakeWalletReference | undefined {
  const indexed = message.trim().match(/^wallet\s+(\d{1,2})$/i);
  if (indexed?.[1]) {
    return { kind: "index", index: Number.parseInt(indexed[1], 10) };
  }

  const pubkey = message.trim().replace(/^wallet:/i, "");
  if (matchingPubkey(pubkey, walletRows) || /^[a-z0-9.]{6,}$/i.test(pubkey)) {
    return { kind: "pubkey", pubkey };
  }
  return undefined;
}

function parseDevWallet(message: string, walletRows: PublicWalletRow[]) {
  const indexed = message.match(/\bwallet\s+(\d{1,2})\s+(?:is\s+)?(?:the\s+)?dev\b/i);
  if (indexed?.[1]) {
    const sentence = sentenceAround(message, indexed.index ?? 0);
    return {
      wallet: { kind: "index", index: Number.parseInt(indexed[1], 10) } as LaunchIntakeWalletReference,
      amountSol: parseSolAmount(sentence),
    };
  }

  const exact = message.match(/\bdev\s+wallet\s+is\s+([a-z0-9.]{6,})\b/i);
  const pubkey = exact?.[1] ? matchingPubkey(exact[1], walletRows) ?? exact[1] : undefined;
  if (!pubkey) {
    return {};
  }
  const sentence = sentenceAround(message, exact?.index ?? 0);
  return {
    wallet: { kind: "pubkey", pubkey } as LaunchIntakeWalletReference,
    amountSol: parseSolAmount(sentence),
  };
}

function parseBundleAllocations(
  message: string,
  devWallet: LaunchIntakeWalletReference | undefined,
  walletRows: PublicWalletRow[],
) {
  const allocations: LaunchIntakeDraft["data"]["bundleAllocations"] = [];
  const indexPattern = /\bwallet\s+(\d{1,2})\s+(buys?|uses?)\s+(\d+(?:\.\d+)?)\s*sol\b/gi;
  for (const match of message.matchAll(indexPattern)) {
    const index = Number.parseInt(match[1], 10);
    if (isDevSentence(message, match.index ?? 0, devWallet, index)) {
      continue;
    }
    allocations.push({
      wallet: { kind: "index", index },
      buyAmountSol: Number.parseFloat(match[3]),
    });
  }

  for (const row of walletRows) {
    const pattern = new RegExp(`${escapeRegExp(row.pubkey)}\\s+buys?\\s+(\\d+(?:\\.\\d+)?)\\s*sol\\b`, "i");
    const match = message.match(pattern);
    if (match?.[1]) {
      allocations.push({
        wallet: { kind: "pubkey", pubkey: row.pubkey },
        buyAmountSol: Number.parseFloat(match[1]),
      });
    }
  }

  return allocations.filter((allocation) => allocation.buyAmountSol > 0);
}

function parseSocials(message: string): LaunchIntakeDraft["data"]["socials"] {
  return {
    ...urlSocial(message, "website", /\b(?:website|site)\s+(https?:\/\/\S+)/i),
    ...urlSocial(message, "telegram", /\btelegram\s+(https?:\/\/\S+|@\S+)/i),
    ...urlSocial(message, "twitter", /\b(?:twitter|x)\s+(https?:\/\/\S+|@\S+)/i),
    ...urlSocial(message, "github", /\bgithub\s+(https?:\/\/\S+)/i),
  };
}

function urlSocial<Key extends keyof LaunchIntakeDraft["data"]["socials"]>(
  message: string,
  key: Key,
  pattern: RegExp,
) {
  const value = cleanUrl(message.match(pattern)?.[1]);
  return value ? { [key]: value } : {};
}

function isSocialsSkip(message: string) {
  return /^(skip|no socials)$/i.test(message.trim()) ||
    /\b(skip\s+socials|no\s+socials|without\s+socials)\b/i.test(message);
}

function resolveWalletReference(
  reference: LaunchIntakeWalletReference,
  walletRows: PublicWalletRow[],
): LaunchIntakeWalletReference {
  if (reference.kind === "index") {
    return {
      ...reference,
      resolvedPubkey: walletRows[reference.index - 1]?.pubkey,
    };
  }
  return {
    ...reference,
    resolvedPubkey: matchingPubkey(reference.pubkey, walletRows),
  };
}

function missingBundleBuyPrompt(
  draft: LaunchIntakeDraft,
  walletRows: PublicWalletRow[],
) {
  const requested = draft.data.requestedBundleWalletCount;
  if (!requested || draft.data.bundleAllocations.length >= requested) {
    return null;
  }

  const missingCount = requested - draft.data.bundleAllocations.length;
  const missingIndexes = nextMissingWalletIndexes(draft, walletRows).slice(0, missingCount);
  if (missingIndexes.length < missingCount) {
    const availableBundleWallets = availableBundleWalletCount(draft, walletRows);
    return `I found ${requested} bundle wallets requested, but only ${availableBundleWallets} imported bundle wallets are available after excluding the dev wallet. Import more bundle wallets before I can prepare the preview.`;
  }
  const suffix = missingIndexes.length === 1
    ? `wallet ${missingIndexes[0]}`
    : `wallets ${formatList(missingIndexes)}`;

  return `I found ${requested} bundle wallets requested, but only ${draft.data.bundleAllocations.length} ${buyAmountLabel(draft.data.bundleAllocations.length)}. What should ${suffix} buy?`;
}

function nextMissingWalletIndexes(
  draft: LaunchIntakeDraft,
  walletRows: PublicWalletRow[],
) {
  const usedPubkeys = new Set<string>();
  if (draft.data.devWallet?.resolvedPubkey) {
    usedPubkeys.add(draft.data.devWallet.resolvedPubkey);
  }
  for (const allocation of draft.data.bundleAllocations) {
    if (allocation.wallet.resolvedPubkey) {
      usedPubkeys.add(allocation.wallet.resolvedPubkey);
    }
  }

  return walletRows
    .map((wallet, index) => ({ index: index + 1, wallet }))
    .filter(({ wallet }) => wallet.role === "bundle" && !usedPubkeys.has(wallet.pubkey))
    .map(({ index }) => index);
}

function availableBundleWalletCount(
  draft: LaunchIntakeDraft,
  walletRows: PublicWalletRow[],
) {
  const devPubkey = draft.data.devWallet?.resolvedPubkey;
  return walletRows.filter(
    (wallet) => wallet.role === "bundle" && wallet.pubkey !== devPubkey,
  ).length;
}

function unresolvedIndexReference(draft: LaunchIntakeDraft) {
  const references = walletReferences(draft);
  return references.find(
    (reference) => reference.kind === "index" && !reference.resolvedPubkey,
  )?.kind === "index"
    ? (references.find(
        (reference) => reference.kind === "index" && !reference.resolvedPubkey,
      ) as Extract<LaunchIntakeWalletReference, { kind: "index" }>).index
    : null;
}

function unresolvedPubkeyReference(draft: LaunchIntakeDraft) {
  const reference = walletReferences(draft).find(
    (item) => item.kind === "pubkey" && !item.resolvedPubkey,
  );
  return reference?.kind === "pubkey" ? reference.pubkey : null;
}

function walletReferences(draft: LaunchIntakeDraft) {
  return [
    ...(draft.data.devWallet ? [draft.data.devWallet] : []),
    ...draft.data.bundleAllocations.map((allocation) => allocation.wallet),
  ];
}

function upsertAllocation(
  allocations: LaunchIntakeDraft["data"]["bundleAllocations"],
  next: LaunchIntakeDraft["data"]["bundleAllocations"][number],
) {
  const existing = allocations.find(
    (allocation) => walletReferenceKey(allocation.wallet) === walletReferenceKey(next.wallet),
  );
  if (existing) {
    existing.buyAmountSol = next.buyAmountSol;
    return;
  }
  allocations.push(next);
}

function walletReferenceKey(reference: LaunchIntakeWalletReference) {
  return reference.kind === "index"
    ? `index:${reference.index}`
    : `pubkey:${reference.pubkey}`;
}

function readyPrompt(draft: LaunchIntakeDraft) {
  const preview = launchIntakePreviewInput(draft);
  const mapping = draft.data.walletIndexesUsed
    ? "Wallet indexes were mapped to the imported wallet table order. "
    : "";
  const buyers = preview.bundleWallets
    .map((wallet) => `${wallet.pubkey} buys ${wallet.buyAmountSol} SOL`)
    .join("; ");

  return `${mapping}Dev wallet ${preview.devWalletPubkey} uses ${preview.devAmountSol} SOL. Bundle wallets: ${buyers}.`;
}

function inferSymbol(tokenName: string | undefined) {
  if (!tokenName) {
    return undefined;
  }
  const words = tokenName.match(/[a-z0-9]+/gi) ?? [];
  if (words.length >= 2) {
    const firstWord = words[0] ?? "";
    const secondWord = words[1] ?? "";
    return `${firstWord[0] ?? ""}${secondWord}`.toUpperCase().slice(0, 8);
  }
  return tokenName.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 4);
}

function parseSolAmount(value: string) {
  const match = value.match(/\b(?:uses?|buys?|creates?\s+with|launches?\s+with)\s+(\d+(?:\.\d+)?)\s*sol\b/i);
  return match?.[1] ? Number.parseFloat(match[1]) : undefined;
}

function parseDirectSolAmount(value: string) {
  const match = value.trim().match(/^(?:uses?|buys?)?\s*(\d+(?:\.\d+)?)\s*(?:sol)?$/i);
  if (!match?.[1]) {
    return undefined;
  }
  const amount = Number.parseFloat(match[1]);
  return Number.isFinite(amount) && amount > 0 ? amount : undefined;
}

function directMissingBuyAllocation(
  draft: LaunchIntakeDraft,
  walletRows: PublicWalletRow[],
  message: string,
) {
  const requested = draft.data.requestedBundleWalletCount;
  if (!requested || requested - draft.data.bundleAllocations.length !== 1) {
    return null;
  }

  const amount = parseDirectSolAmount(message);
  const [index] = nextMissingWalletIndexes(draft, walletRows);
  if (!amount || !index) {
    return null;
  }

  return {
    wallet: { kind: "index" as const, index },
    buyAmountSol: amount,
  };
}

function isDevSentence(
  message: string,
  offset: number,
  devWallet: LaunchIntakeWalletReference | undefined,
  index: number,
) {
  return devWallet?.kind === "index" &&
    devWallet.index === index &&
    /\bdev\b/i.test(clauseAround(message, offset));
}

function sentenceAround(message: string, offset: number) {
  return message.slice(Math.max(0, offset - 80), offset + 160);
}

function clauseAround(message: string, offset: number) {
  const before = message.lastIndexOf(". ", offset);
  const after = message.indexOf(". ", offset);
  return message.slice(before + 1, after === -1 ? message.length : after);
}

function matchingPubkey(pubkey: string, walletRows: PublicWalletRow[]) {
  return walletRows.find((wallet) => wallet.pubkey === pubkey)?.pubkey;
}

function stripEmptySocials(socials: LaunchIntakeDraft["data"]["socials"]) {
  return {
    ...(socials.website ? { website: socials.website } : {}),
    ...(socials.telegram ? { telegram: socials.telegram } : {}),
    ...(socials.twitter ? { twitter: socials.twitter } : {}),
    ...(socials.github ? { github: socials.github } : {}),
  };
}

function cleanText(value: string | undefined) {
  const cleaned = value?.trim().replace(/[\s,;:]+$/, "");
  return cleaned || undefined;
}

function cleanUrl(value: string | undefined) {
  return value?.trim().replace(/[),.;]+$/, "");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatList(values: number[]) {
  if (values.length <= 2) {
    return values.join(" and ");
  }
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function buyAmountLabel(count: number) {
  return count === 1 ? "buy amount" : "buy amounts";
}
