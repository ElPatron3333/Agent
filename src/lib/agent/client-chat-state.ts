import type { ActivePreview, MockChatResult } from "@/lib/agent/mock-chat";
import type { LastConfigSnapshot } from "@/lib/agent/last-config-memory";
import type { SmithiiLiveBoundary } from "@/lib/smithii/live-boundary";

const GENERIC_CHAT_ERROR =
  "The mock chat route failed. Check the dev logs and try again.";

export type ChatErrorState = {
  message: string;
  clearPendingPlan: boolean;
  clearActivePreview: boolean;
  executionStatus?: string;
};

export type PreviewLiveState = {
  activePreview: ActivePreview | null;
  smithiiLive: SmithiiLiveBoundary | null;
};

export function nextPreviewLiveState(
  result: MockChatResult,
  current: PreviewLiveState,
): PreviewLiveState {
  const activePreview = nextActivePreview(result, current.activePreview);

  if (result.smithiiLive) {
    return { activePreview, smithiiLive: result.smithiiLive };
  }

  if (activePreview && activePreview === current.activePreview) {
    return { activePreview, smithiiLive: current.smithiiLive };
  }

  return { activePreview, smithiiLive: null };
}

export function nextActivePreview(
  result: MockChatResult,
  currentPreview: ActivePreview | null,
) {
  if (result.activePreview) {
    return result.activePreview;
  }

  if (result.draft || shouldClearPreview(result)) {
    return null;
  }

  return currentPreview;
}

export function chatErrorStateForResponse(error: string | null | undefined) {
  if (error === "Invalid pending plan.") {
    return {
      message: error,
      clearPendingPlan: true,
      clearActivePreview: true,
      executionStatus: "Invalid preview",
    };
  }

  return {
    message: GENERIC_CHAT_ERROR,
    clearPendingPlan: false,
    clearActivePreview: false,
  };
}

export function inputForLastConfig(config: LastConfigSnapshot) {
  if (config.kind === "launch_volume_sequence") {
    const token = config.label.match(/Launch \+ Volume: (.+?)(?:\s\/\s.+)?$/)?.[1] ??
      "Template Token";
    const template = templateLabel(config.templateId);
    return `launch a token called ${token} then start volume after 5 min with ${template} template`;
  }

  return `repeat ${config.label}`;
}

function templateLabel(templateId: string | undefined) {
  if (templateId === "stealth_v1") {
    return "stealth";
  }
  if (templateId === "slow_burn_v1") {
    return "slow burn";
  }

  return "momentum";
}

function shouldClearPreview(result: MockChatResult) {
  return (
    [
      "Preview expired",
      "Invalid preview",
      "Mock swap signature returned",
      "Volume bot started",
      "Launch + Volume sequence queued",
    ].includes(result.executionStatus) ||
    result.executionStatus.endsWith("... returned")
  );
}
