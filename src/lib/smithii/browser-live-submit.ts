import {
  createPumpBrowserClient,
  pumpBrowserHandoffConfigFromEnv,
  type PumpBrowserHandoffEnv,
} from "@/lib/smithii/browser-handoff";
import {
  executePumpBundleLaunchBrowserHandoff,
  executePumpBundleSwapBrowserHandoff,
  normalizePumpBrowserExecutionError,
  type NormalizedPumpBrowserExecutionError,
  type PumpBrowserExecutorClient,
  type PumpBundleLaunchBrowserHandoffInput,
  type PumpBundleLaunchBrowserHandoffResult,
  type PumpBundleSwapBrowserHandoffInput,
  type PumpBundleSwapBrowserHandoffResult,
} from "@/lib/smithii/pump-browser-executor";
import type { BrowserWalletSigner } from "@/lib/solana/browser-wallet-signer";

export type BrowserLiveSubmitPacket =
  | {
      kind: "bundle_launch";
      executorInput: PumpBundleLaunchBrowserHandoffInput;
    }
  | {
      kind: "bundle_swap";
      executorInput: PumpBundleSwapBrowserHandoffInput;
    };

export type BrowserLiveSubmitReadiness =
  | {
      status: "ready";
    }
  | {
      status: "blocked";
      reason: string;
    };

export type BrowserLiveSubmitResult =
  | {
      status: "blocked";
      reason: string;
    }
  | {
      status: "submitted";
      result: PumpBundleLaunchBrowserHandoffResult | PumpBundleSwapBrowserHandoffResult;
    }
  | {
      status: "failed";
      error: NormalizedPumpBrowserExecutionError;
    };

export type BrowserLiveSubmitInput = {
  packet: BrowserLiveSubmitPacket | null;
  signer: BrowserWalletSigner | null;
  approval: boolean;
  env: PumpBrowserHandoffEnv;
  now?: Date;
  clientFactory?: (signer: BrowserWalletSigner) => PumpBrowserExecutorClient;
};

export function browserLiveSubmitReadiness({
  packet,
  signer,
  approval,
  env,
}: Pick<BrowserLiveSubmitInput, "packet" | "signer" | "approval" | "env">): BrowserLiveSubmitReadiness {
  if (!packet) {
    return blocked("Browser packet must be prepared before live submit.");
  }
  if (!signer) {
    return blocked("Connected browser wallet signer is required.");
  }
  if (!approval) {
    return blocked("Explicit live submit approval is required.");
  }

  try {
    pumpBrowserHandoffConfigFromEnv(env);
  } catch (error) {
    return blocked(error instanceof Error ? error.message : "Smithii browser handoff config is invalid.");
  }

  return { status: "ready" };
}

export async function executeBrowserLiveSubmit({
  packet,
  signer,
  approval,
  env,
  now = new Date(),
  clientFactory,
}: BrowserLiveSubmitInput): Promise<BrowserLiveSubmitResult> {
  const readiness = browserLiveSubmitReadiness({ packet, signer, approval, env });
  if (readiness.status === "blocked") {
    return readiness;
  }

  try {
    const client = clientFactory
      ? clientFactory(signer!)
      : createPumpBrowserClient(
          pumpBrowserHandoffConfigFromEnv(env),
          signer! as Parameters<typeof createPumpBrowserClient>[1],
        );

    if (packet!.kind === "bundle_launch") {
      return {
        status: "submitted",
        result: await executePumpBundleLaunchBrowserHandoff(client, {
          ...packet!.executorInput,
          now,
        }),
      };
    }

    return {
      status: "submitted",
      result: await executePumpBundleSwapBrowserHandoff(client, {
        ...packet!.executorInput,
        now,
      }),
    };
  } catch (error) {
    return {
      status: "failed",
      error: normalizePumpBrowserExecutionError(error),
    };
  }
}

function blocked(reason: string): BrowserLiveSubmitReadiness {
  return { status: "blocked", reason };
}


