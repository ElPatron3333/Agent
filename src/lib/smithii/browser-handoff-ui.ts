import type { ActivePreview, PendingPlan } from "@/lib/agent/mock-chat";
import type { SmithiiLiveBoundary } from "@/lib/smithii/live-boundary";

export type BrowserHandoffUiModel = {
  status: "Ready for browser handoff setup";
  flowLabel: "Bundle Launch" | "Bundle Swap";
  planId: string;
  sdkMethod: string;
  disabledActionLabel: "Browser handoff not wired";
  requiredMaterials: string[];
};

export type BrowserHandoffUiInput = {
  activePreview: ActivePreview | null;
  pendingPlan: PendingPlan | null;
  smithiiLive: SmithiiLiveBoundary | null;
};

const HANDOFF_STATUS = "Ready for browser handoff setup" as const;
const DISABLED_ACTION_LABEL = "Browser handoff not wired" as const;

export function browserHandoffUiModel({
  activePreview,
  pendingPlan,
  smithiiLive,
}: BrowserHandoffUiInput): BrowserHandoffUiModel | null {
  if (!activePreview || !pendingPlan || smithiiLive?.mode !== "browser-handoff-ready") {
    return null;
  }

  if (activePreview.kind === "bundle_launch" && pendingPlan.tool === "bundle_launch") {
    return {
      status: HANDOFF_STATUS,
      flowLabel: "Bundle Launch",
      planId: pendingPlan.id,
      sdkMethod: smithiiLive.sdkMethod,
      disabledActionLabel: DISABLED_ACTION_LABEL,
      requiredMaterials: [
        "Token metadata image",
        "Generated mint keypair",
        "Connected dev wallet signer",
        "Browser-held bundle wallet material",
      ],
    };
  }

  if (
    activePreview.kind === "bundle_swap" &&
    activePreview.direction !== "token_to_token" &&
    pendingPlan.tool === "bundle_swap"
  ) {
    return {
      status: HANDOFF_STATUS,
      flowLabel: "Bundle Swap",
      planId: pendingPlan.id,
      sdkMethod: smithiiLive.sdkMethod,
      disabledActionLabel: DISABLED_ACTION_LABEL,
      requiredMaterials: [
        "Token mint address",
        "Connected fee wallet signer",
        "Browser-held participating wallet material",
        "Per-wallet amounts",
      ],
    };
  }

  return null;
}
