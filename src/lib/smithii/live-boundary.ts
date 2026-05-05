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
      questionsForSmithii: [],
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
            "Token-to-token bundle swap is not supported in the reviewed Pump SDK flow.",
          ]
        : [],
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
      "Launch + Volume cannot be automated live because Smithii confirmed no launch-to-volume scheduler contract and Volume Bot is backend-keyed.",
    ],
    questionsForSmithii: [],
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
    sdkMethod: "market_maker_bot_ HTTP endpoints",
    browserRequiredSignerArgs: [],
    blockers: [
      "Classic Volume Bot is backend-keyed and cannot satisfy the zero-custody requirement for this integration.",
      "Anti-MEV is a separate product from classic Volume Bot and multi-wallet Anti-MEV sends private keys to a backend.",
    ],
    questionsForSmithii: [],
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

