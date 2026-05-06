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

  const signerWallet = signer.publicKey.toBase58();
  const planWallet = packet.executorInput.plan.wallet;
  if (signerWallet !== planWallet) {
    return blocked(
      `Connected browser wallet ${signerWallet} does not match browser execution plan wallet ${planWallet}.`,
    );
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
      error: sanitizeBrowserLiveSubmitError(
        normalizePumpBrowserExecutionError(error),
        packet!,
      ),
    };
  }
}

const PRIVATE_KEY_FIELD_LABEL_PATTERN = /\b(pk|privKeys|privateKey|secretKey|seedPhrase)\b/gi;

function sanitizeBrowserLiveSubmitError(
  error: NormalizedPumpBrowserExecutionError,
  packet: BrowserLiveSubmitPacket,
): NormalizedPumpBrowserExecutionError {
  return {
    ...error,
    message: redactKnownSensitiveText(error.message, packet),
  };
}

function redactKnownSensitiveText(
  value: string,
  packet: BrowserLiveSubmitPacket,
) {
  const withoutKnownValues = packetSensitiveValues(packet).reduce(
    (current, sensitiveValue) => current.split(sensitiveValue).join("[redacted]"),
    value,
  );

  return withoutKnownValues.replace(
    PRIVATE_KEY_FIELD_LABEL_PATTERN,
    "[redacted-field]",
  );
}

function packetSensitiveValues(packet: BrowserLiveSubmitPacket) {
  const values =
    packet.kind === "bundle_launch"
      ? [
          packet.executorInput.metadata.description,
          ...packet.executorInput.buyers.map((buyer) => buyer.pk),
        ]
      : packet.executorInput.privKeys;

  return values.filter((value) => value.trim().length > 0);
}

function blocked(reason: string): BrowserLiveSubmitReadiness {
  return { status: "blocked", reason };
}


