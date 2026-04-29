import type { ActivePreview, MockChatResult } from "@/lib/agent/mock-chat";

const GENERIC_CHAT_ERROR =
  "The mock chat route failed. Check the dev logs and try again.";

export type ChatErrorState = {
  message: string;
  clearPendingPlan: boolean;
  clearActivePreview: boolean;
  executionStatus?: string;
};

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

function shouldClearPreview(result: MockChatResult) {
  return (
    [
      "Preview expired",
      "Invalid preview",
      "Mock swap signature returned",
      "Volume bot started",
    ].includes(result.executionStatus) ||
    result.executionStatus.endsWith("... returned")
  );
}
