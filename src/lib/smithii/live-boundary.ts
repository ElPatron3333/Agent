import type { ActivePreview, PendingPlan } from "@/lib/agent/mock-chat";

export type SmithiiLiveMode =
  | "mock"
  | "browser-handoff-ready"
  | "blocked-awaiting-smithii";

export type SmithiiLiveBoundary = {
  mode: SmithiiLiveMode;
  serverExecution: "blocked";
  sdkPackage: "@smithii/sdk";
  sdkMethod: string;
  browserRequiredSignerArgs: string[];
  blockers: string[];
  questionsForSmithii: string[];
};

const BROWSER_TX_ASSEMBLY_QUESTION =
  "Can Smithii provide the browser-side tx assembly module or equivalent zero-custody handoff for this Pro flow?";

const VOLUME_MAPPING_QUESTION =
  "Where do Volume Bot onPurchase, sellTiming, sellMode, and sellStrategy map in SDK v0.2.0?";

const BUNDLE_LAUNCH_BROWSER_SIGNER_MATERIAL = "bundle buyer signer material";
const BUNDLE_SWAP_BROWSER_SIGNER_MATERIAL = "bundle swap wallet signer material";

export function liveBoundaryForPreview(
  preview: ActivePreview,
): SmithiiLiveBoundary {
  if (preview.kind === "bundle_launch") {
    return {
      mode: "browser-handoff-ready",
      serverExecution: "blocked",
      sdkPackage: "@smithii/sdk",
      sdkMethod: "PumpFunClient.createAndSnipeToken",
      browserRequiredSignerArgs: [BUNDLE_LAUNCH_BROWSER_SIGNER_MATERIAL],
      blockers: [],
      questionsForSmithii: [BROWSER_TX_ASSEMBLY_QUESTION],
    };
  }

  if (preview.kind === "bundle_swap") {
    const tokenToTokenBlockers = preview.direction === "token_to_token"
      ? ["@smithii/sdk/pump bundleSellBuy does not expose token-to-token swaps."]
      : [];

    return {
      mode: tokenToTokenBlockers.length
        ? "blocked-awaiting-smithii"
        : "browser-handoff-ready",
      serverExecution: "blocked",
      sdkPackage: "@smithii/sdk",
      sdkMethod: "PumpFunClient.bundleSellBuy",
      browserRequiredSignerArgs: [BUNDLE_SWAP_BROWSER_SIGNER_MATERIAL],
      blockers: tokenToTokenBlockers,
      questionsForSmithii: tokenToTokenBlockers.length
        ? [
            "Does Smithii expose a zero-custody token-to-token bundle swap path for Pro users?",
            BROWSER_TX_ASSEMBLY_QUESTION,
          ]
        : [BROWSER_TX_ASSEMBLY_QUESTION],
    };
  }

  if (preview.kind === "volume_bot") {
    return volumeBotBoundary();
  }

  return {
    mode: "blocked-awaiting-smithii",
    serverExecution: "blocked",
    sdkPackage: "@smithii/sdk",
    sdkMethod: "Composite: Bundle Launch + Volume Bot",
    browserRequiredSignerArgs: [BUNDLE_LAUNCH_BROWSER_SIGNER_MATERIAL],
    blockers: [
      "Launch + Volume sequence cannot be live until Volume Bot live mapping is confirmed.",
    ],
    questionsForSmithii: [
      BROWSER_TX_ASSEMBLY_QUESTION,
      "Can Smithii support launch-to-volume sequencing without backend private-key custody?",
      VOLUME_MAPPING_QUESTION,
    ],
  };
}

export function mockLiveBoundaryForTool(
  tool: PendingPlan["tool"],
): SmithiiLiveBoundary {
  return {
    mode: "mock",
    serverExecution: "blocked",
    sdkPackage: "@smithii/sdk",
    sdkMethod: mockSdkMethodForTool(tool),
    browserRequiredSignerArgs: browserSignerArgsForTool(tool),
    blockers: [],
    questionsForSmithii: [],
  };
}

export function requireServerLiveExecutionBlocked(
  tool: PendingPlan["tool"],
): never {
  throw new Error(
    `Live Smithii execution must not run on the backend for ${tool}. Use the browser-only Smithii handoff boundary.`,
  );
}

function volumeBotBoundary(): SmithiiLiveBoundary {
  return {
    mode: "blocked-awaiting-smithii",
    serverExecution: "blocked",
    sdkPackage: "@smithii/sdk",
    sdkMethod: "AntiMEVClient.runSingle",
    browserRequiredSignerArgs: [],
    blockers: [
      "Smithii must confirm Volume Bot onPurchase/sellTiming/sellMode/sellStrategy mapping.",
      "AntiMEVClient.runMultiple is blocked because it sends wallet key material to the backend.",
    ],
    questionsForSmithii: [
      "Does AntiMEVClient.runSingle exactly power Pro Volume Bot or only Anti-MEV volume?",
      VOLUME_MAPPING_QUESTION,
      "Can Smithii provide a zero-custody multi-wallet Volume Bot flow, or is runMultiple intentionally backend-keyed?",
    ],
  };
}

function mockSdkMethodForTool(tool: PendingPlan["tool"]) {
  if (tool === "bundle_launch") {
    return "Mock: PumpFunClient.createAndSnipeToken";
  }
  if (tool === "bundle_swap") {
    return "Mock: PumpFunClient.bundleSellBuy";
  }
  if (tool === "volume_bot") {
    return "Mock: AntiMEVClient.runSingle";
  }

  return "Mock: Composite: Bundle Launch + Volume Bot";
}

function browserSignerArgsForTool(tool: PendingPlan["tool"]) {
  if (tool === "bundle_launch" || tool === "launch_volume_sequence") {
    return [BUNDLE_LAUNCH_BROWSER_SIGNER_MATERIAL];
  }
  if (tool === "bundle_swap") {
    return [BUNDLE_SWAP_BROWSER_SIGNER_MATERIAL];
  }

  return [];
}

