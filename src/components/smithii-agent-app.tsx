"use client";

import type { ChangeEvent, FormEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Keypair } from "@solana/web3.js";

import type {
  ActivePreview,
  ChatMessage,
  Draft,
  MockChatResult,
  PendingPlan,
  VolumeBotRun,
} from "@/lib/agent/mock-chat";
import {
  readStoredLastSequenceConfig,
  writeStoredLastConfig,
  type LastConfigSnapshot,
} from "@/lib/agent/last-config-memory";
import {
  chatErrorStateForResponse,
  inputForLastConfig,
  nextPreviewLiveState,
} from "@/lib/agent/client-chat-state";
import type { AuditLogRecord } from "@/lib/audit-log-types";
import type { SmithiiLiveBoundary } from "@/lib/smithii/live-boundary";
import {
  browserHandoffUiModel,
  type BrowserHandoffUiModel,
} from "@/lib/smithii/browser-handoff-ui";
import {
  bundleLaunchBrowserExecutionSummary,
  prepareBundleLaunchBrowserExecution,
  type BundleLaunchBrowserExecutionSummary,
} from "@/lib/smithii/bundle-launch-browser-wiring";
import {
  bundleSwapBrowserExecutionSummary,
  prepareBundleSwapBrowserExecution,
  type BundleSwapBrowserExecutionSummary,
} from "@/lib/smithii/bundle-swap-browser-wiring";
import {
  executeBrowserLiveSubmit,
  type BrowserLiveSubmitResult,
} from "@/lib/smithii/browser-live-submit";
import {
  connectInjectedSolanaWallet,
  injectedSolanaProviderFromWindow,
  type BrowserWalletSigner,
  type BrowserWalletWindowLike,
} from "@/lib/solana/browser-wallet-signer";
import type { PumpBrowserHandoffEnv } from "@/lib/smithii/browser-handoff";
import type { GlobalSettings } from "@/lib/smithii/types";
import { BundleLaunchPreview } from "@/components/previews/bundle-launch-preview";
import { DEFAULT_GLOBAL_SETTINGS } from "@/lib/global-settings";
import {
  buildLaunchWalletSelection,
  buildSwapWalletSelection,
  exportPrivateKeyCsv,
  parsePrivateKeyCsv,
  toPublicWalletRows,
  type BrowserWalletEntry,
} from "@/lib/wallet-roster";

const initialMessages: ChatMessage[] = [
  {
    role: "assistant",
    text: "Describe the launch you want to prepare. I will build a preview first, then hand off live execution in the browser after approval.",
  },
];

// Browser tooling can inject attributes like fdprocessedid before hydration.
const hydrationSafeControlProps = { suppressHydrationWarning: true } as const;

type BundleSwapPreviewState = Extract<ActivePreview, { kind: "bundle_swap" }>;

type BundleLaunchPreparationState =
  | {
      kind: "bundle_launch";
      status: "ready";
      scopeKey: string;
      summary: BundleLaunchBrowserExecutionSummary;
    }
  | {
      kind: "bundle_launch";
      status: "blocked";
      scopeKey: string;
      reason: string;
    };

type BundleSwapPreparationState =
  | {
      kind: "bundle_swap";
      status: "ready";
      scopeKey: string;
      summary: BundleSwapBrowserExecutionSummary;
    }
  | {
      kind: "bundle_swap";
      status: "blocked";
      scopeKey: string;
      reason: string;
    };

type BrowserPreparationState = BundleLaunchPreparationState | BundleSwapPreparationState;

type BrowserWalletConnectionState =
  | {
      status: "disconnected";
      label: string;
    }
  | {
      status: "connected";
      walletLabel: string;
      signer: BrowserWalletSigner;
    }
  | {
      status: "blocked";
      reason: string;
    };

type BrowserLiveApprovalState = {
  scopeKey: string;
  approved: boolean;
};

type BrowserLiveSubmitState =
  | {
      scopeKey: string;
      status: "submitting";
    }
  | ({ scopeKey: string } & BrowserLiveSubmitResult);

type AuditLogFilter = "bundler" | "volume" | "swap";

const auditLogFilters = ["bundler", "volume", "swap"] as const;

export function SmithiiAgentApp() {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [walletRoster, setWalletRoster] = useState<BrowserWalletEntry[]>([]);
  const [selectedVolumeWalletPubkey, setSelectedVolumeWalletPubkey] =
    useState("");
  const [input, setInput] = useState("");
  const [pendingPlan, setPendingPlan] = useState<PendingPlan | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const globalSettings: GlobalSettings = DEFAULT_GLOBAL_SETTINGS;
  const [activePreview, setActivePreview] = useState<ActivePreview | null>(null);
  const [executionStatus, setExecutionStatus] = useState("Waiting for preview");
  const [smithiiLive, setSmithiiLive] = useState<SmithiiLiveBoundary | null>(null);
  const [, setVolumeBotRun] = useState<VolumeBotRun | null>(null);
  const [lastSequenceConfig, setLastSequenceConfig] =
    useState<LastConfigSnapshot | null>(null);
  const [auditLog, setAuditLog] = useState<AuditLogRecord[]>([]);
  const [visibleAuditLogFilters, setVisibleAuditLogFilters] = useState<
    Record<AuditLogFilter, boolean>
  >({ bundler: true, volume: true, swap: true });
  const [walletImportStatus, setWalletImportStatus] =
    useState("Import the user's live test wallets before preparing handoff.");
  const [launchIntakeImageFile, setLaunchIntakeImageFile] =
    useState<File | null>(null);
  const [bundleLaunchPreparation, setBundleLaunchPreparation] =
    useState<BundleLaunchPreparationState | null>(null);
  const [bundleLaunchMetadataFile, setBundleLaunchMetadataFile] =
    useState<{ scopeKey: string; file: File } | null>(null);
  const [bundleLaunchMintKeypair, setBundleLaunchMintKeypair] =
    useState<{ scopeKey: string; mintKeypair: Keypair } | null>(null);
  const [bundleSwapPreparation, setBundleSwapPreparation] =
    useState<BundleSwapPreparationState | null>(null);
  const [browserWallet, setBrowserWallet] = useState<BrowserWalletConnectionState>({
    status: "disconnected",
    label: "No browser wallet connected.",
  });
  const [liveSubmitApproval, setLiveSubmitApproval] =
    useState<BrowserLiveApprovalState | null>(null);
  const [submitResult, setSubmitResult] =
    useState<BrowserLiveSubmitState | null>(null);
  const [isSending, setIsSending] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const activeVolumeWalletPubkey = walletRoster.some(
    (wallet) =>
      wallet.role === "bundle" && wallet.pubkey === selectedVolumeWalletPubkey,
  )
    ? selectedVolumeWalletPubkey
    : "";
  const publicWalletRows = toPublicWalletRows(walletRoster);
  const visibleAuditLog = auditLog.filter((record) =>
    auditRecordMatchesFilters(record, visibleAuditLogFilters),
  );
  const browserHandoff = browserHandoffUiModel({
    activePreview,
    pendingPlan,
    smithiiLive,
  });
  const bundleLaunchPreparationScope = bundleLaunchPreparationScopeKey({
    activePreview,
    pendingPlan,
    smithiiLive,
    walletRoster,
  });
  const bundleSwapPreparationScope = bundleSwapPreparationScopeKey({
    activePreview,
    pendingPlan,
    smithiiLive,
    walletRoster,
  });
  const visibleBundleLaunchPreparation =
    bundleLaunchPreparation?.scopeKey === bundleLaunchPreparationScope
      ? bundleLaunchPreparation
      : null;
  const visibleLaunchIntakeImageFile =
    activePreview?.kind === "bundle_launch" &&
    launchIntakeImageFile?.name === activePreview.imageFileName
      ? launchIntakeImageFile
      : null;
  const visibleBundleLaunchMetadataFile =
    bundleLaunchMetadataFile?.scopeKey === bundleLaunchPreparationScope
      ? bundleLaunchMetadataFile.file
      : visibleLaunchIntakeImageFile;
  const visibleBundleLaunchMintKeypair =
    bundleLaunchMintKeypair?.scopeKey === bundleLaunchPreparationScope
      ? bundleLaunchMintKeypair.mintKeypair
      : null;
  const visibleBundleSwapPreparation =
    bundleSwapPreparation?.scopeKey === bundleSwapPreparationScope
      ? bundleSwapPreparation
      : null;
  const visibleBrowserPreparation =
    browserHandoff?.preparation?.kind === "bundle_launch"
      ? visibleBundleLaunchPreparation
      : visibleBundleSwapPreparation;
  const browserLiveSubmitScope =
    browserHandoff?.preparation?.kind === "bundle_launch"
      ? bundleLaunchPreparationScope
      : browserHandoff?.preparation?.kind === "bundle_swap"
        ? bundleSwapPreparationScope
        : "no-browser-live-submit";
  const visibleLiveSubmitApproval =
    liveSubmitApproval?.scopeKey === browserLiveSubmitScope
      ? liveSubmitApproval.approved
      : false;
  const visibleSubmitResult =
    submitResult?.scopeKey === browserLiveSubmitScope ? submitResult : null;
  const connectedBrowserSigner =
    browserWallet.status === "connected" ? browserWallet.signer : null;

  useEffect(() => {
    void refreshAuditLog();

    const loadSavedSequence = window.setTimeout(() => {
      setLastSequenceConfig(readStoredLastSequenceConfig(window.localStorage));
    }, 0);

    return () => window.clearTimeout(loadSavedSequence);
  }, []);

  async function refreshAuditLog() {
    try {
      const response = await fetch("/api/audit-log");
      if (!response.ok) {
        return;
      }
      const body = (await response.json()) as { records?: AuditLogRecord[] };
      setAuditLog(body.records ?? []);
    } catch {
      setAuditLog([]);
    }
  }

  function toggleAuditLogFilter(filter: AuditLogFilter) {
    setVisibleAuditLogFilters((current) => ({
      ...current,
      [filter]: !current[filter],
    }));
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = input.trim();
    if (!trimmed || isSending) {
      return;
    }

    const userMessage: ChatMessage = { role: "user", text: trimmed };
    setMessages((current) => [...current, userMessage]);
    setInput("");
    setIsSending(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          pendingPlan,
          draft,
          launchWalletSelection: launchSelectionForDraft(draft, walletRoster),
          launchWalletRows: publicWalletRows,
          launchImageFileName: launchIntakeImageFile?.name ?? null,
          swapWalletSelection: swapSelectionForDraftOrIntent(
            draft,
            walletRoster,
            trimmed,
          ),
          volumeWalletSelection: volumeSelectionForDraft(
            draft,
            activeVolumeWalletPubkey,
            trimmed,
          ),
          globalSettings,
        }),
      });

      if (!response.ok) {
        const errorState = chatErrorStateForResponse(
          await responseErrorMessage(response),
        );
        if (errorState.clearPendingPlan) {
          setPendingPlan(null);
        }
        if (errorState.clearActivePreview) {
          setActivePreview(null);
          setSmithiiLive(null);
        }
        if (errorState.executionStatus) {
          setExecutionStatus(errorState.executionStatus);
        }
        throw new Error(errorState.message);
      }

      const result = (await response.json()) as MockChatResult;
      const nextPreviewState = nextPreviewLiveState(result, {
        activePreview,
        smithiiLive,
      });
      setMessages((current) => [...current, result.assistantMessage]);
      setPendingPlan(result.pendingPlan);
      setDraft(result.draft);
      setActivePreview(nextPreviewState.activePreview);
      rememberLastConfig(result.activePreview);
      setExecutionStatus(result.executionStatus);
      setSmithiiLive(nextPreviewState.smithiiLive);
      setVolumeBotRun(result.volumeBotRun ?? null);
      void refreshAuditLog();
    } catch (error) {
      const message =
        error instanceof Error &&
        (error.message === "Not enough bundle wallets are available." ||
          error.message === "Bundle Swap wallet count must be a whole number from 1 to 20." ||
          error.message === "A dev wallet is required for Bundle Launch." ||
          error.message === "A bundle wallet is required for Volume Bot." ||
          error.message === "Invalid volume wallet selection." ||
          error.message === "Invalid pending plan." ||
          error.message === "Preview expired")
          ? error.message
          : "The agent route failed. Check the dev logs and try again.";
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: message,
        },
      ]);
    } finally {
      setIsSending(false);
    }
  }

  async function importPrivateKeys(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      const csv = await file.text();
      const importedWallets = parsePrivateKeyCsv(csv);
      setWalletRoster((current) => mergeImportedWallets(current, importedWallets));
      setWalletImportStatus(
        `Imported ${importedWallets.length} wallet(s). Private keys were not sent to the backend.`,
      );
    } catch (error) {
      setWalletImportStatus(
        error instanceof Error ? error.message : "Could not import private keys.",
      );
    }
  }

  function exportPrivateKeys() {
    const csv = exportPrivateKeyCsv(walletRoster);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "smithii-wallet-private-keys.csv";
    link.click();
    URL.revokeObjectURL(url);
    setWalletImportStatus("Exported private keys from browser state.");
  }

  async function connectBrowserWallet() {
    if (typeof window === "undefined") {
      setBrowserWallet({
        status: "blocked",
        reason: "Browser wallet connection is only available in the browser.",
      });
      return;
    }

    const connection = await connectInjectedSolanaWallet(
      injectedSolanaProviderFromWindow(window as unknown as BrowserWalletWindowLike),
    );
    if (connection.status === "connected") {
      setBrowserWallet({
        status: "connected",
        walletLabel: connection.walletLabel,
        signer: connection.signer,
      });
      return;
    }

    setBrowserWallet({ status: "blocked", reason: connection.reason });
  }

  function rememberLastConfig(preview: ActivePreview | null) {
    if (
      !preview ||
      preview.kind !== "launch_volume_sequence" ||
      typeof window === "undefined"
    ) {
      return;
    }

    const snapshot = lastConfigSnapshotForPreview(preview);
    writeStoredLastConfig(window.localStorage, snapshot);
    setLastSequenceConfig(snapshot);
  }

  function selectBundleLaunchMetadataFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setBundleLaunchMetadataFile(
      file ? { scopeKey: bundleLaunchPreparationScope, file } : null,
    );
    setBundleLaunchPreparation(null);
  }

  function selectLaunchIntakeImageFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setLaunchIntakeImageFile(file);
    setBundleLaunchPreparation(null);
  }

  function prepareBundleLaunchBrowserPacket() {
    const scopeKey = bundleLaunchPreparationScope;
    const mintKeypair = visibleBundleLaunchMintKeypair ?? Keypair.generate();
    if (!visibleBundleLaunchMintKeypair) {
      setBundleLaunchMintKeypair({ scopeKey, mintKeypair });
    }

    const prepared = prepareBundleLaunchBrowserExecution({
      activePreview,
      pendingPlan,
      smithiiLive,
      walletRoster,
      metadataFile: visibleBundleLaunchMetadataFile,
      mintKeypair,
      nonce: bundleLaunchPreparationNonce(pendingPlan),
      now: new Date(),
    });

    if (prepared.status === "blocked") {
      setBundleLaunchPreparation({
        kind: "bundle_launch",
        status: "blocked",
        scopeKey,
        reason: prepared.reason,
      });
      return;
    }

    setBundleLaunchPreparation({
      kind: "bundle_launch",
      status: "ready",
      scopeKey,
      summary: bundleLaunchBrowserExecutionSummary(prepared.packet),
    });
  }
  function prepareBundleSwapBrowserPacket() {
    const scopeKey = bundleSwapPreparationScope;
    const feeWalletPubkey = feeWalletPubkeyForRoster(walletRoster);
    if (!feeWalletPubkey) {
      setBundleSwapPreparation({
        kind: "bundle_swap",
        status: "blocked",
        scopeKey,
        reason: "Connected fee wallet signer is missing.",
      });
      return;
    }

    const prepared = prepareBundleSwapBrowserExecution({
      activePreview,
      pendingPlan,
      smithiiLive,
      walletRoster,
      feeWalletPubkey,
      nonce: bundleSwapPreparationNonce(pendingPlan),
      now: new Date(),
    });

    if (prepared.status === "blocked") {
      setBundleSwapPreparation({
        kind: "bundle_swap",
        status: "blocked",
        scopeKey,
        reason: prepared.reason,
      });
      return;
    }

    setBundleSwapPreparation({
      kind: "bundle_swap",
      status: "ready",
      scopeKey,
      summary: bundleSwapBrowserExecutionSummary(prepared.packet),
    });
  }

  async function submitPreparedBrowserPacket() {
    const scopeKey = browserLiveSubmitScope;
    setSubmitResult({ scopeKey, status: "submitting" });

    if (browserHandoff?.preparation?.kind === "bundle_launch") {
      const mintKeypair = visibleBundleLaunchMintKeypair ?? Keypair.generate();
      if (!visibleBundleLaunchMintKeypair) {
        setBundleLaunchMintKeypair({ scopeKey, mintKeypair });
      }

      const prepared = prepareBundleLaunchBrowserExecution({
        activePreview,
        pendingPlan,
        smithiiLive,
        walletRoster,
        metadataFile: visibleBundleLaunchMetadataFile,
        mintKeypair,
        nonce: bundleLaunchPreparationNonce(pendingPlan),
        now: new Date(),
      });
      if (prepared.status === "blocked") {
        setBundleLaunchPreparation({
          kind: "bundle_launch",
          status: "blocked",
          scopeKey,
          reason: prepared.reason,
        });
        setSubmitResult({ scopeKey, status: "blocked", reason: prepared.reason });
        return;
      }

      setBundleLaunchPreparation({
        kind: "bundle_launch",
        status: "ready",
        scopeKey,
        summary: bundleLaunchBrowserExecutionSummary(prepared.packet),
      });
      const result = await executeBrowserLiveSubmit({
        packet: { kind: "bundle_launch", executorInput: prepared.packet.executorInput },
        signer: connectedBrowserSigner,
        approval: visibleLiveSubmitApproval,
        env: browserLiveSubmitEnv(),
        now: new Date(),
      });
      setSubmitResult({ scopeKey, ...result });
      return;
    }

    if (browserHandoff?.preparation?.kind === "bundle_swap") {
      if (!connectedBrowserSigner) {
        setSubmitResult({
          scopeKey,
          status: "blocked",
          reason: "Connected browser wallet signer is required.",
        });
        return;
      }

      const prepared = prepareBundleSwapBrowserExecution({
        activePreview,
        pendingPlan,
        smithiiLive,
        walletRoster,
        feeWalletPubkey: connectedBrowserSigner.publicKey.toBase58(),
        nonce: bundleSwapPreparationNonce(pendingPlan),
        now: new Date(),
      });
      if (prepared.status === "blocked") {
        setBundleSwapPreparation({
          kind: "bundle_swap",
          status: "blocked",
          scopeKey,
          reason: prepared.reason,
        });
        setSubmitResult({ scopeKey, status: "blocked", reason: prepared.reason });
        return;
      }

      setBundleSwapPreparation({
        kind: "bundle_swap",
        status: "ready",
        scopeKey,
        summary: bundleSwapBrowserExecutionSummary(prepared.packet),
      });
      const result = await executeBrowserLiveSubmit({
        packet: { kind: "bundle_swap", executorInput: prepared.packet.executorInput },
        signer: connectedBrowserSigner,
        approval: visibleLiveSubmitApproval,
        env: browserLiveSubmitEnv(),
        now: new Date(),
      });
      setSubmitResult({ scopeKey, ...result });
      return;
    }

    setSubmitResult({
      scopeKey,
      status: "blocked",
      reason: "Browser live submit requires a prepared Bundle Launch or Bundle Swap.",
    });
  }

  return (
    <main className="min-h-screen bg-[#030707] text-[#eefafa]">
      <div className="grid min-h-screen grid-cols-1 xl:grid-cols-[454px_minmax(0,1fr)]">
        <aside className="flex min-h-screen flex-col border-b border-[#07515a] bg-[#050908] p-4 xl:border-b-0 xl:border-r">
          <div className="flex items-center gap-3">
            <Image
              src="/smithii-mark.webp"
              alt="Smithii"
              width={42}
              height={42}
              className="h-10 w-10 object-contain"
              priority
            />
            <h1 className="text-3xl font-semibold leading-none text-[#d9ffff]">
              <span className="text-[#20b9c7]">Smithii</span> Tools
            </h1>
          </div>

          <section className="mt-10 border-t border-[#07515a] pt-8">
            <div className="flex flex-wrap items-center gap-5">
              <h2 className="text-base font-semibold text-[#f3ffff]">Logs:</h2>
              {auditLogFilters.map((log) => (
                <label
                  key={log}
                  className="flex items-center gap-2 text-sm font-semibold text-[#ddffff]"
                >
                  <input
                    {...hydrationSafeControlProps}
                    className="h-4 w-4 rounded border border-[#3a4548] bg-black accent-[#1db7c5]"
                    type="checkbox"
                    checked={visibleAuditLogFilters[log]}
                    onChange={() => toggleAuditLogFilter(log)}
                  />
                  {log}
                </label>
              ))}
            </div>
            <div className="mt-7 grid grid-cols-4 gap-3 text-center text-xs text-slate-400">
              <span>Time</span>
              <span>Wallet</span>
              <span>Behavior</span>
              <span>Status</span>
            </div>
            <div className="mt-5 min-h-[116px] space-y-2 text-xs text-slate-500">
              {visibleAuditLog.slice(-4).reverse().map((record) => (
                <div
                  key={record.id}
                  className="grid grid-cols-4 gap-3 rounded-md border border-[#0a3035] bg-black/20 p-2 text-center"
                >
                  <span>{record.createdAt.slice(11, 16)}</span>
                  <span className="truncate">{record.tool ?? "agent"}</span>
                  <span className="truncate text-[#9feff0]">
                    {auditEventLabel(record.event)}
                  </span>
                  <span className="truncate">{record.outcome}</span>
                </div>
              ))}
              {visibleAuditLog.length === 0 ? (
                <p className="pt-4 text-center">No Data Available.</p>
              ) : null}
            </div>
            <div className="mt-4 flex gap-2">
              <button
                {...hydrationSafeControlProps}
                className="h-8 rounded-md border border-[#0b6973] px-3 text-xs font-semibold text-[#a8ffff]"
                type="button"
                onClick={() => void refreshAuditLog()}
              >
                Refresh
              </button>
              <button
                {...hydrationSafeControlProps}
                className="h-8 rounded-md border border-[#0b6973] px-3 text-xs font-semibold text-[#a8ffff] disabled:cursor-not-allowed disabled:opacity-40"
                type="button"
                onClick={() => exportAuditLog(visibleAuditLog)}
                disabled={visibleAuditLog.length === 0}
              >
                Export JSON
              </button>
            </div>
          </section>

          <section className="mt-8">
            <h2 className="text-base font-semibold text-[#f3ffff]">
              Session
            </h2>
            <div className="mt-3 space-y-2 text-sm text-slate-300">
              <PreviewRow label="Wallets" value={`${walletRoster.length} loaded`} />
              <PreviewRow label="Mode" value={liveModeLabel(smithiiLive)} />
              <PreviewRow label="Flow" value={lastSequenceConfig?.kind ?? "None"} />
              <PreviewRow
                label="Saved"
                value={lastSequenceConfig?.label ?? "No saved sequence"}
              />
            </div>
            <button
              {...hydrationSafeControlProps}
              className="mt-3 h-9 w-full rounded-md border border-[#0b6973] px-3 text-sm font-semibold text-[#a8ffff] disabled:cursor-not-allowed disabled:opacity-50"
              type="button"
              disabled={!lastSequenceConfig}
              onClick={() => {
                if (lastSequenceConfig) {
                  setInput(inputForLastConfig(lastSequenceConfig));
                }
              }}
            >
              Reuse sequence
            </button>
          </section>

          <button
            {...hydrationSafeControlProps}
            className="mt-auto h-9 rounded-md border border-rose-900/80 text-sm font-semibold text-pink-300"
            type="button"
            onClick={() => {
              setMessages(initialMessages);
              setPendingPlan(null);
              setDraft(null);
              setActivePreview(null);
              setSmithiiLive(null);
              setVolumeBotRun(null);
              setExecutionStatus("Waiting for preview");
              setLaunchIntakeImageFile(null);
              setWalletRoster([]);
              setWalletImportStatus(
                "Import the user's live test wallets before preparing handoff.",
              );
            }}
          >
            Delete Session
          </button>
        </aside>

        <section className="flex min-w-0 flex-col bg-[#030707]">
          <header className="flex min-h-[56px] flex-wrap items-stretch justify-between border-b border-[#07515a] bg-[#050908]">
            <div className="flex min-h-[56px] items-center border-r border-[#07515a] bg-[#08272b] px-6 text-base font-medium text-[#25c3d0]">
              Smithii launch agent
            </div>
            <div className="flex items-center px-4 text-sm font-semibold">
              <button
                {...hydrationSafeControlProps}
                className="h-10 rounded-md bg-[#25aebe] px-5 text-sm font-semibold text-white"
                type="button"
                onClick={() => void connectBrowserWallet()}
              >
                {browserWallet.status === "connected"
                  ? "Wallet Connected"
                  : "Connect Wallet"}
              </button>
            </div>
          </header>

          <div className="grid flex-1 grid-cols-1 gap-5 border-b border-[#07515a] p-6 2xl:grid-cols-[minmax(0,1fr)_430px]">
            <section className="min-w-0">
              <div className="grid gap-4 xl:grid-cols-2">
                <PreviewPanel preview={activePreview} />
                <Panel title="Confirm & Handoff">
                  {browserHandoff ? (
                    <BrowserHandoffPanel
                      model={browserHandoff}
                      preparation={visibleBrowserPreparation}
                      browserWallet={browserWallet}
                      approval={visibleLiveSubmitApproval}
                      submitResult={visibleSubmitResult}
                      launchMetadataFileName={visibleBundleLaunchMetadataFile?.name ?? null}
                      onLaunchMetadataFileChange={selectBundleLaunchMetadataFile}
                      onApprovalChange={(approved) =>
                        setLiveSubmitApproval({
                          scopeKey: browserLiveSubmitScope,
                          approved,
                        })
                      }
                      onPrepare={
                        browserHandoff.preparation?.kind === "bundle_launch"
                          ? prepareBundleLaunchBrowserPacket
                          : browserHandoff.preparation?.kind === "bundle_swap"
                            ? prepareBundleSwapBrowserPacket
                            : undefined
                      }
                      onSubmit={() => void submitPreparedBrowserPacket()}
                    />
                  ) : (
                    <p className="rounded-md border border-[#07515a] bg-black/20 p-3 text-sm leading-6 text-slate-300">
                      A live browser handoff appears here after the agent
                      prepares a launch preview.
                    </p>
                  )}
                </Panel>
              </div>

              <Panel className="mt-5 min-h-[360px]" title="Wallet">
                <input
                  {...hydrationSafeControlProps}
                  ref={importInputRef}
                  className="hidden"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={importPrivateKeys}
                />
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-slate-400">
                    Import the live test wallets provided by the user. The
                    table starts empty.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      {...hydrationSafeControlProps}
                      className="h-9 rounded-md border border-[#0b6973] px-4 text-sm font-semibold text-[#a8ffff]"
                      type="button"
                      onClick={() => importInputRef.current?.click()}
                    >
                      Import PKs
                    </button>
                    <button
                      {...hydrationSafeControlProps}
                      className="h-9 rounded-md border border-[#0b6973] px-4 text-sm font-semibold text-[#a8ffff] disabled:cursor-not-allowed disabled:opacity-40"
                      type="button"
                      onClick={exportPrivateKeys}
                      disabled={walletRoster.length === 0}
                    >
                      Export PKs
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="border-b border-[#07515a] text-xs text-slate-400">
                      <tr>
                        <th className="py-3 pr-4">#</th>
                        <th className="py-3 pr-4">Wallet</th>
                        <th className="py-3 pr-4">SOL Balance</th>
                        <th className="py-3 pr-4">Token Balance</th>
                        <th className="py-3 pr-4">% Of Supply</th>
                        <th className="py-3 pr-4">Volume</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#073f46] text-slate-300">
                      {publicWalletRows.length === 0 ? (
                        <tr>
                          <td
                            className="py-8 text-center text-sm text-slate-500"
                            colSpan={6}
                          >
                            No wallets loaded. Import the user-provided live test
                            wallets before preparing handoff.
                          </td>
                        </tr>
                      ) : null}
                      {publicWalletRows.map((wallet, index) => (
                        <tr key={wallet.id}>
                          <td className="py-3 pr-4 text-slate-500">
                            {walletIndexLabel(index)}
                          </td>
                          <td className="py-3 pr-4 text-slate-100">
                            <span className="mr-2 rounded-md bg-[#08272b] px-2 py-1 text-xs font-semibold text-[#a8ffff]">
                              {wallet.role}
                            </span>
                            {wallet.pubkey}
                          </td>
                          <td className="py-3 pr-4">
                            {wallet.solBalance.toFixed(2)}
                          </td>
                          <td className="py-3 pr-4">{wallet.tokenBalance}</td>
                          <td className="py-3 pr-4">
                            {wallet.pctOfSupply.toFixed(1)}
                          </td>
                          <td className="py-3 pr-4">
                            {wallet.role === "bundle" ? (
                              <button
                                {...hydrationSafeControlProps}
                                className="h-8 rounded-md border border-cyan-700 px-2 text-xs font-semibold text-cyan-100 disabled:border-emerald-700 disabled:text-emerald-200"
                                type="button"
                                disabled={
                                  activeVolumeWalletPubkey === wallet.pubkey
                                }
                                onClick={() =>
                                  setSelectedVolumeWalletPubkey(wallet.pubkey)
                                }
                              >
                                {activeVolumeWalletPubkey === wallet.pubkey
                                  ? "Selected"
                                  : "Use"}
                              </button>
                            ) : (
                              <span className="text-xs text-slate-600">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {activeVolumeWalletPubkey ? (
                  <PreviewRow
                    label="Volume wallet"
                    value={activeVolumeWalletPubkey}
                  />
                ) : null}
                <p className="mt-4 text-sm text-slate-400">
                  {walletImportStatus}
                </p>
              </Panel>
            </section>

            <aside className="min-w-0 space-y-5">
              <Panel title="Agent Console">
                <div className="max-h-[440px] space-y-3 overflow-y-auto pr-1">
                  {messages.map((message, index) => (
                    <div
                      key={`${message.role}-${index}`}
                      className="rounded-md border border-[#0a3035] bg-[#071011] p-3"
                    >
                      <p className="text-xs font-semibold uppercase text-cyan-300">
                        {message.role === "assistant" ? "agent" : "you"}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-300">
                        {message.text}
                      </p>
                    </div>
                  ))}
                </div>
                <label className="mt-4 block rounded-md border border-[#073f46] bg-black/20 p-3 text-sm text-slate-300">
                  <span className="block text-xs uppercase text-slate-500">
                    Launch image
                  </span>
                  <input
                    {...hydrationSafeControlProps}
                    className="mt-2 block w-full text-sm text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-[#25aebe] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
                    type="file"
                    accept="image/*"
                    onChange={selectLaunchIntakeImageFile}
                  />
                  <span className="mt-2 block text-xs text-slate-500">
                    {launchIntakeImageFile?.name ?? "No image selected"}
                  </span>
                </label>
                <form className="mt-4 flex gap-2" onSubmit={sendMessage}>
                  <input
                    {...hydrationSafeControlProps}
                    className="h-10 min-w-0 flex-1 rounded-md border border-[#344044] bg-[#080b0b] px-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-[#16a9b6]"
                    placeholder="Describe the token launch to prepare"
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                  />
                  <button
                    {...hydrationSafeControlProps}
                    className="h-10 rounded-md bg-[#25aebe] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    type="submit"
                    disabled={isSending || input.trim().length === 0}
                  >
                    {isSending ? "..." : "Send"}
                  </button>
                </form>
                <div className="mt-3 rounded-md border border-[#073f46] bg-black/20 px-3 py-2 text-sm text-slate-400">
                  <span className="text-slate-500">Status:</span>{" "}
                  <span className="text-slate-200">{executionStatus}</span>
                </div>
              </Panel>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}

function lastConfigSnapshotForPreview(
  preview: ActivePreview,
): LastConfigSnapshot {
  if (preview.kind === "launch_volume_sequence") {
    return {
      kind: preview.kind,
      label: `Launch + Volume: ${preview.token}`,
      templateId: preview.templateId,
      updatedAt: new Date().toISOString(),
    };
  }

  if (preview.kind === "bundle_launch") {
    return {
      kind: preview.kind,
      label: `Bundle Launch: ${preview.token}`,
      updatedAt: new Date().toISOString(),
    };
  }

  if (preview.kind === "bundle_swap") {
    return {
      kind: preview.kind,
      label: `Bundle Swap: ${preview.fromToken} to ${preview.toToken}`,
      updatedAt: new Date().toISOString(),
    };
  }

  return {
    kind: preview.kind,
    label: `Volume Bot: ${preview.tokenAddress}`,
    updatedAt: new Date().toISOString(),
  };
}

function exportAuditLog(records: AuditLogRecord[]) {
  const blob = new Blob([JSON.stringify(records, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "smithii-agent-audit-log.json";
  link.click();
  URL.revokeObjectURL(url);
}

function auditEventLabel(event: AuditLogRecord["event"]) {
  if (event === "mock_executed") {
    return "Test executed";
  }
  if (event === "confirmation_rejected") {
    return "Confirm rejected";
  }
  if (event === "confirmation_expired") {
    return "Confirm expired";
  }
  if (event === "private_key_rejected") {
    return "Private key rejected";
  }

  return "Preview prepared";
}

function auditRecordMatchesFilters(
  record: AuditLogRecord,
  filters: Record<AuditLogFilter, boolean>,
) {
  const category = auditRecordFilterCategory(record);
  return filters[category];
}

function auditRecordFilterCategory(record: AuditLogRecord): AuditLogFilter {
  if (record.tool === "volume_bot" || record.tool === "launch_volume_sequence") {
    return "volume";
  }
  if (record.tool === "bundle_swap") {
    return "swap";
  }

  return "bundler";
}

async function responseErrorMessage(response: Response) {
  try {
    const body = (await response.json()) as {
      error?: unknown;
      executionStatus?: unknown;
    };
    if (typeof body.error === "string") {
      return body.error;
    }

    return typeof body.executionStatus === "string" ? body.executionStatus : null;
  } catch {
    return null;
  }
}

function PreviewPanel({ preview }: { preview: ActivePreview | null }) {
  if (!preview) {
    return (
      <Panel title="Preview">
        <p className="text-sm leading-6 text-slate-300">
          Ask for a Bundle Launch, Bundle Swap, or Volume Bot to create a fresh
          preview.
        </p>
      </Panel>
    );
  }

  if (preview.kind === "bundle_launch") {
    return (
      <Panel title="Bundle Launch Preview">
        <BundleLaunchPreview preview={preview} />
      </Panel>
    );
  }

  if (preview.kind === "bundle_swap") {
    return (
      <Panel title="Bundle Swap Preview">
        <PreviewRow label="Direction" value={directionLabel(preview.direction)} />
        <PreviewRow label="From" value={preview.fromToken} />
        <PreviewRow label="To" value={preview.toToken} />
        <PreviewRow label="Routing" value={preview.routing} />
        <PreviewRow
          label="Wallets"
          value={`${preview.readyWallets}/${preview.walletCount} ready`}
        />
        <PreviewRow
          label="Skipped"
          value={`${preview.skippedWallets} wallet(s)`}
        />
        <PreviewRow label="Quantity" value={preview.quantityModeLabel} />
        <PreviewRow label="TX count" value={String(preview.txCount)} />
        <PreviewRow
          label="Delay"
          value={`${preview.txDelayBlocks} blocks (${preview.estimatedTotalS.toFixed(1)}s total)`}
        />
        <PreviewRow
          label="Overrides"
          value={perTxOverrideLabel(preview.perTxOverrides)}
        />
        <PreviewRow
          label="Speed"
          value={settingSpeedLabel(preview.globalSettings.speed)}
        />
        <PreviewRow
          label="Jito tip"
          value={settingJitoLabel(preview.globalSettings.jitoTip)}
        />
        <PreviewRow
          label="MEV protection"
          value={preview.globalSettings.mevProtection ? "On" : "Off"}
        />
        <PreviewRow
          label="Slippage"
          value={`${preview.globalSettings.slippagePct}%`}
        />
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-xs">
            <thead className="uppercase text-slate-500">
              <tr>
                <th className="py-2">Wallet</th>
                <th className="py-2">SOL</th>
                <th className="py-2">Token</th>
                <th className="py-2">Plan</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cyan-950/70">
              {preview.perWallet.map((wallet) => (
                <tr key={wallet.pubkey}>
                  <td className="py-2 text-slate-200">{wallet.pubkey}</td>
                  <td className="py-2">{wallet.solBalance.toFixed(2)}</td>
                  <td className="py-2">{wallet.tokenBalance}</td>
                  <td className="py-2">
                    {plannedAmountLabel(
                      preview.quantityModeLabel,
                      wallet.plannedAmountSolOrPct,
                    )}
                  </td>
                  <td className="py-2">{walletStatusLabel(wallet.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 rounded-md border border-cyan-950/80 p-3 text-sm text-slate-300">
          {preview.summary}
        </p>
      </Panel>
    );
  }

  if (preview.kind === "launch_volume_sequence") {
    return (
      <Panel title="Launch + Volume Preview">
        <PreviewRow label="Token" value={preview.token} />
        <PreviewRow label="Template" value={preview.templateName} />
        <PreviewRow label="Delay" value={`${preview.delayMinutes} minutes`} />
        <PreviewRow
          label="Bundle wallets"
          value={String(preview.launch.bundleWalletCount)}
        />
        <PreviewRow
          label="Bundle buys"
          value={`${preview.launch.totalBuysSol.toFixed(2)} SOL`}
        />
        <PreviewRow label="Volume wallet" value={preview.volume.volumeWalletPubkey} />
        <PreviewRow label="Makers" value={String(preview.volume.makers)} />
        <PreviewRow
          label="Speed"
          value={settingSpeedLabel(preview.globalSettings.speed)}
        />
        <PreviewRow
          label="Jito tip"
          value={settingJitoLabel(preview.globalSettings.jitoTip)}
        />
        <p className="mt-4 rounded-md border border-cyan-950/80 p-3 text-sm text-slate-300">
          {preview.summary}
        </p>
      </Panel>
    );
  }

  return (
    <Panel title="Volume Bot Preview">
      <PreviewRow label="Token" value={preview.tokenAddress} />
      <PreviewRow label="Volume wallet" value={preview.volumeWalletPubkey} />
      <PreviewRow label="Makers" value={String(preview.makers)} />
      <PreviewRow
        label="Order range"
        value={`${preview.orderAmount.minSol}-${preview.orderAmount.maxSol} SOL`}
      />
      <PreviewRow
        label="Delay"
        value={`${preview.delaySeconds.min}-${preview.delaySeconds.max}s`}
      />
      <PreviewRow label="On purchase" value={onPurchaseLabel(preview.onPurchase)} />
      <PreviewRow label="Sell timing" value={sellTimingLabel(preview.sellTiming)} />
      <PreviewRow label="Sell mode" value={sellModeLabel(preview.sellMode)} />
      <PreviewRow label="Duration" value={preview.expectedDurationText} />
      <PreviewRow
        label="Speed"
        value={settingSpeedLabel(preview.globalSettings.speed)}
      />
      <PreviewRow
        label="Jito tip"
        value={settingJitoLabel(preview.globalSettings.jitoTip)}
      />
      <PreviewRow
        label="MEV protection"
        value={preview.globalSettings.mevProtection ? "On" : "Off"}
      />
      <PreviewRow
        label="Slippage"
        value={`${preview.globalSettings.slippagePct}%`}
      />
      {preview.sellStrategy ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[320px] text-left text-xs">
            <thead className="uppercase text-slate-500">
              <tr>
                <th className="py-2">Sell pct</th>
                <th className="py-2">Delay</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cyan-950/70">
              {preview.sellStrategy.legs.map((leg, index) => (
                <tr key={`${leg.sellPct.min}-${leg.sellPct.max}-${index}`}>
                  <td className="py-2 text-slate-200">
                    {leg.sellPct.min}-{leg.sellPct.max}%
                  </td>
                  <td className="py-2">
                    {leg.delaySeconds.min}-{leg.delaySeconds.max}s
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <p className="mt-4 rounded-md border border-cyan-950/80 p-3 text-sm text-slate-300">
        {preview.summary}
      </p>
    </Panel>
  );
}

function BrowserHandoffPanel({
  model,
  preparation,
  browserWallet,
  approval,
  submitResult,
  launchMetadataFileName,
  onLaunchMetadataFileChange,
  onApprovalChange,
  onPrepare,
  onSubmit,
}: {
  model: BrowserHandoffUiModel;
  preparation: BrowserPreparationState | null;
  browserWallet: BrowserWalletConnectionState;
  approval: boolean;
  submitResult: BrowserLiveSubmitState | null;
  launchMetadataFileName?: string | null;
  onLaunchMetadataFileChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  onApprovalChange: (approved: boolean) => void;
  onPrepare?: () => void;
  onSubmit?: () => void;
}) {
  const canPrepare = Boolean(model.preparation && onPrepare);
  const isLaunchPreparation = model.preparation?.kind === "bundle_launch";
  const isSubmitting = submitResult?.status === "submitting";
  const canSubmit = Boolean(
    model.preparation &&
      preparation?.status === "ready" &&
      browserWallet.status === "connected" &&
      approval &&
      onSubmit &&
      !isSubmitting,
  );

  return (
    <div className="mt-4 rounded-md border border-[#0b6973] bg-[#062022] p-3">
      <PreviewRow label="Handoff status" value={model.status} />
      <PreviewRow label="Flow" value={model.flowLabel} />
      <PreviewRow label="SDK method" value={model.sdkMethod} />
      <PreviewRow label="Plan" value={model.planId} />
      <PreviewRow label="Wallet" value={browserWalletStatusText(browserWallet)} />
      <div className="mt-3">
        <p className="text-xs uppercase text-slate-500">Required in browser</p>
        <ul className="mt-2 space-y-1 text-sm text-slate-300">
          {model.requiredMaterials.map((material) => (
            <li key={material}>{material}</li>
          ))}
        </ul>
      </div>
      {isLaunchPreparation ? (
        <label className="mt-3 block rounded-md border border-[#0b6973] p-3 text-sm text-slate-300">
          <span className="block text-xs uppercase text-slate-500">
            Metadata image
          </span>
          <input
            {...hydrationSafeControlProps}
            className="mt-2 block w-full text-sm text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-[#25aebe] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
            type="file"
            accept="image/*"
            onChange={onLaunchMetadataFileChange}
          />
          <span className="mt-2 block text-xs text-slate-500">
            {launchMetadataFileName ?? "No image selected"}
          </span>
        </label>
      ) : null}
      {preparation ? <BrowserPreparationStatus preparation={preparation} /> : null}
      <label className="mt-3 flex items-start gap-2 rounded-md border border-[#0b6973] p-3 text-sm text-slate-300">
        <input
          {...hydrationSafeControlProps}
          className="mt-1 h-4 w-4 accent-[#25c3d0]"
          type="checkbox"
          checked={approval}
          onChange={(event) => onApprovalChange(event.target.checked)}
        />
        <span>Explicit live submit approval</span>
      </label>
      <button
        {...hydrationSafeControlProps}
        className={`mt-3 h-9 w-full rounded-md border px-3 text-sm font-semibold ${
          canPrepare
            ? "border-[#25aebe] bg-[#25aebe] text-white"
            : "cursor-not-allowed border-[#0b6973] text-[#a8ffff] opacity-60"
        }`}
        type="button"
        disabled={!canPrepare}
        onClick={onPrepare}
      >
        {model.preparation?.actionLabel ?? model.disabledActionLabel}
      </button>
      <button
        {...hydrationSafeControlProps}
        className={`mt-3 h-9 w-full rounded-md border px-3 text-sm font-semibold ${
          canSubmit
            ? "border-[#25aebe] bg-[#25aebe] text-white"
            : "cursor-not-allowed border-[#0b6973] text-[#a8ffff] opacity-60"
        }`}
        type="button"
        disabled={!canSubmit}
        onClick={onSubmit}
      >
        {liveSubmitActionLabel(model)}
      </button>
      {submitResult ? <BrowserSubmitStatus submitResult={submitResult} /> : null}
    </div>
  );
}

function BrowserPreparationStatus({
  preparation,
}: {
  preparation: BrowserPreparationState;
}) {
  if (preparation.status === "blocked") {
    const label =
      preparation.kind === "bundle_launch"
        ? "Browser launch packet unavailable"
        : "Browser swap packet unavailable";

    return (
      <p className="mt-3 rounded-md border border-amber-800/80 p-3 text-sm text-amber-100">
        {label}: {preparation.reason}
      </p>
    );
  }

  if (preparation.kind === "bundle_launch") {
    const { summary } = preparation;

    return (
      <div className="mt-3 rounded-md border border-[#0b6973] p-3 text-sm text-slate-300">
        <PreviewRow label="Packet" value={summary.status} />
        <PreviewRow label="Flow" value={summary.flow} />
        <PreviewRow label="Plan" value={summary.planId} />
        <PreviewRow label="Idempotency" value={summary.idempotencyKey} />
        <PreviewRow label="Mint" value={summary.mint} />
        <PreviewRow label="Dev amount" value={`${summary.devAmount} SOL`} />
        <PreviewRow label="Buyers" value={String(summary.buyerCount)} />
        <PreviewRow
          label="Pregenerate"
          value={summary.isTokenPregenerated ? "Yes" : "No"}
        />
        <PreviewRow
          label="Cashback"
          value={summary.isCashbackCoin ? "Yes" : "No"}
        />
      </div>
    );
  }

  const { summary } = preparation;

  return (
    <div className="mt-3 rounded-md border border-[#0b6973] p-3 text-sm text-slate-300">
      <PreviewRow label="Packet" value={summary.status} />
      <PreviewRow label="Flow" value={summary.flow} />
      <PreviewRow label="Plan" value={summary.planId} />
      <PreviewRow label="Idempotency" value={summary.idempotencyKey} />
      <PreviewRow label="Action" value={summary.action} />
      <PreviewRow label="Pool" value={summary.pool} />
      <PreviewRow label="Wallets" value={String(summary.walletCount)} />
      <PreviewRow label="Amounts" value={String(summary.amountCount)} />
    </div>
  );
}

function BrowserSubmitStatus({
  submitResult,
}: {
  submitResult: BrowserLiveSubmitState;
}) {
  if (submitResult.status === "submitting") {
    return (
      <p className="mt-3 rounded-md border border-[#0b6973] p-3 text-sm text-[#a8ffff]">
        Submitting browser packet to Smithii.
      </p>
    );
  }

  if (submitResult.status === "blocked") {
    return (
      <p className="mt-3 rounded-md border border-amber-800/80 p-3 text-sm text-amber-100">
        Live submit blocked: {submitResult.reason}
      </p>
    );
  }

  if (submitResult.status === "failed") {
    return (
      <div className="mt-3 rounded-md border border-rose-800/80 p-3 text-sm text-slate-300">
        <PreviewRow label="Submit" value="Failed" />
        <PreviewRow label="Category" value={submitResult.error.category} />
        <PreviewRow label="Message" value={submitResult.error.message} />
        {submitResult.error.bundleId ? (
          <PreviewRow label="Bundle" value={submitResult.error.bundleId} />
        ) : null}
        {submitResult.error.signature ? (
          <PreviewRow label="Signature" value={submitResult.error.signature} />
        ) : null}
      </div>
    );
  }

  if (submitResult.result.flow === "bundle_launch") {
    return (
      <div className="mt-3 rounded-md border border-[#0b6973] p-3 text-sm text-slate-300">
        <PreviewRow label="Submit" value="Submitted" />
        <PreviewRow label="Flow" value={submitResult.result.flow} />
        <PreviewRow label="Plan" value={submitResult.result.planId} />
        <PreviewRow label="Idempotency" value={submitResult.result.idempotencyKey} />
        <PreviewRow label="Mint" value={submitResult.result.mint} />
        <PreviewRow label="Create tx" value={submitResult.result.createTxSignature} />
        <PreviewRow
          label="Buyer txs"
          value={String(submitResult.result.buyerTxSignatures.length)}
        />
        <PreviewRow
          label="Bundles"
          value={String(submitResult.result.bundleIds.length)}
        />
        <PreviewRow label="Payment" value={submitResult.result.paymentSignature} />
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-md border border-[#0b6973] p-3 text-sm text-slate-300">
      <PreviewRow label="Submit" value="Submitted" />
      <PreviewRow label="Flow" value={submitResult.result.flow} />
      <PreviewRow label="Plan" value={submitResult.result.planId} />
      <PreviewRow label="Idempotency" value={submitResult.result.idempotencyKey} />
      <PreviewRow label="Action" value={submitResult.result.action} />
      <PreviewRow
        label="TXs"
        value={String(submitResult.result.txSignatures.length)}
      />
      <PreviewRow
        label="Bundles"
        value={String(submitResult.result.bundleIds.length)}
      />
      <PreviewRow label="Payment" value={submitResult.result.paymentSignature} />
    </div>
  );
}

function browserLiveSubmitEnv(): PumpBrowserHandoffEnv {
  return {
    NEXT_PUBLIC_SOLANA_RPC_URL: process.env.NEXT_PUBLIC_SOLANA_RPC_URL,
    NEXT_PUBLIC_SMITHII_PROXY_URL: process.env.NEXT_PUBLIC_SMITHII_PROXY_URL,
    NEXT_PUBLIC_SMITHII_JITO_UUID: process.env.NEXT_PUBLIC_SMITHII_JITO_UUID,
  };
}

function browserWalletStatusText(wallet: BrowserWalletConnectionState) {
  if (wallet.status === "connected") {
    return wallet.walletLabel;
  }
  if (wallet.status === "blocked") {
    return wallet.reason;
  }

  return wallet.label;
}

function liveSubmitActionLabel(model: BrowserHandoffUiModel) {
  if (model.preparation?.kind === "bundle_launch") {
    return "Submit live launch via Smithii";
  }
  if (model.preparation?.kind === "bundle_swap") {
    return "Submit live swap via Smithii";
  }

  return "Submit live via Smithii";
}

function Panel({
  title,
  className = "",
  children,
}: {
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`rounded-md border border-[#07515a] bg-[#050b0b] p-4 ${className}`}
    >
      <h2 className="text-base font-semibold text-[#f3ffff]">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[#073f46] py-2 text-sm last:border-b-0">
      <span className="text-slate-500">{label}</span>
      <span className="overflow-hidden text-ellipsis text-right font-medium text-slate-100">
        {value}
      </span>
    </div>
  );
}

function liveModeLabel(boundary: SmithiiLiveBoundary | null) {
  if (!boundary || boundary.mode === "mock") {
    return "Preview required";
  }
  if (boundary.mode === "browser-handoff-ready") {
    return "Browser handoff ready";
  }

  return "Blocked awaiting Smithii";
}

function bundleLaunchPreparationScopeKey(input: {
  activePreview: ActivePreview | null;
  pendingPlan: PendingPlan | null;
  smithiiLive: SmithiiLiveBoundary | null;
  walletRoster: BrowserWalletEntry[];
}) {
  const { activePreview } = input;
  const launchScope =
    activePreview?.kind === "bundle_launch"
      ? [
          activePreview.tokenName,
          activePreview.tokenSymbol,
          activePreview.description,
          activePreview.imageFileName,
          activePreview.devWalletPubkey,
          activePreview.devAmountSol,
          activePreview.serviceFeeSol,
          activePreview.devWalletFeesSol,
          activePreview.bundleWallets
            .map((wallet) => `${wallet.pubkey}:${wallet.buyAmountSol}`)
            .join("|"),
          activePreview.modifiers.cashbackCoin,
          activePreview.modifiers.useDifferentBlocks,
          activePreview.modifiers.pregenerateTokenAddress,
          activePreview.socials.website ?? "",
          activePreview.socials.telegram ?? "",
          activePreview.socials.twitter ?? "",
          activePreview.socials.github ?? "",
        ].join("::")
      : "no-launch-preview";

  return [bundleSwapPreparationScopeKey(input), launchScope].join("::");
}
function bundleSwapPreparationScopeKey({
  activePreview,
  pendingPlan,
  smithiiLive,
  walletRoster,
}: {
  activePreview: ActivePreview | null;
  pendingPlan: PendingPlan | null;
  smithiiLive: SmithiiLiveBoundary | null;
  walletRoster: BrowserWalletEntry[];
}) {
  const previewId =
    activePreview?.kind === "volume_bot"
      ? activePreview.botId
      : activePreview?.kind === "launch_volume_sequence"
        ? activePreview.sequenceId
        : activePreview?.planId;
  const publicWalletMaterial = walletRoster
    .map((wallet) =>
      [wallet.pubkey, wallet.role, Boolean(wallet.privateKey.trim())].join(":"),
    )
    .join("|");

  return [
    activePreview?.kind ?? "none",
    previewId ?? "no-preview",
    pendingPlan?.tool ?? "no-tool",
    pendingPlan?.id ?? "no-plan",
    smithiiLive?.mode ?? "no-live",
    publicWalletMaterial,
  ].join("::");
}

function feeWalletPubkeyForRoster(walletRoster: BrowserWalletEntry[]) {
  return walletRoster.find((wallet) => wallet.role === "dev")?.pubkey ?? null;
}

function walletIndexLabel(index: number) {
  return String(index + 1);
}

function bundleLaunchPreparationNonce(pendingPlan: PendingPlan | null) {
  return pendingPlan
    ? `bundle-launch-browser-${pendingPlan.id}-${pendingPlan.createdAt}`
    : "bundle-launch-browser-no-plan";
}
function bundleSwapPreparationNonce(pendingPlan: PendingPlan | null) {
  return pendingPlan
    ? `bundle-swap-browser-${pendingPlan.id}-${pendingPlan.createdAt}`
    : "bundle-swap-browser-no-plan";
}

function launchSelectionForDraft(
  draft: Draft | null,
  walletRoster: BrowserWalletEntry[],
) {
  if (
    draft?.tool !== "bundle_launch" ||
    !draft.data.walletCount ||
    !draft.data.solPerWallet
  ) {
    return null;
  }

  return buildLaunchWalletSelection({
    roster: walletRoster,
    walletCount: draft.data.walletCount,
    solPerWallet: draft.data.solPerWallet,
  });
}

function swapSelectionForDraftOrIntent(
  draft: Draft | null,
  walletRoster: BrowserWalletEntry[],
  message: string,
) {
  const walletCount =
    draft?.tool === "bundle_swap" && draft.data.walletCount
      ? draft.data.walletCount
      : isCompleteSwapIntentForSelection(message)
        ? swapIntentWalletCount(message) ?? 3
        : null;

  if (!walletCount) {
    return null;
  }

  return buildSwapWalletSelection({
    roster: walletRoster,
    walletCount,
  });
}

function volumeSelectionForDraft(
  draft: Draft | null,
  selectedVolumeWalletPubkey: string,
  message: string,
) {
  if (!selectedVolumeWalletPubkey) {
    return null;
  }

  const isVolumeDraft = draft?.tool === "volume_bot";
  const isSequenceIntent = /\blaunch\b/i.test(message) && /\bvolume\b/i.test(message);

  if (!isVolumeDraft && !isSequenceIntent) {
    return null;
  }

  return {
    volumeWalletPubkey: selectedVolumeWalletPubkey,
  };
}

function isCompleteSwapIntentForSelection(message: string) {
  return (
    /\b(sell|dump|swap)\b/i.test(message) &&
    /\b(\d+(?:\.\d+)?)\s*(?:percent|pct|%|sol)\b/i.test(message)
  );
}

function swapIntentWalletCount(message: string) {
  const match = message.match(/\b(\d{1,2})\s*[- ]?(?:bundle\s*)?wallets?\b/i);
  if (!match?.[1]) {
    return null;
  }

  const walletCount = Number.parseInt(match[1], 10);
  return Number.isInteger(walletCount) && walletCount >= 1 && walletCount <= 20
    ? walletCount
    : null;
}

function mergeImportedWallets(
  current: BrowserWalletEntry[],
  importedWallets: BrowserWalletEntry[],
) {
  const existingDevWallets = current.filter((wallet) => wallet.role === "dev");
  const existingBundleWallets = current.filter((wallet) => wallet.role === "bundle");
  const offset = existingBundleWallets.length;

  return [
    ...existingDevWallets,
    ...existingBundleWallets,
    ...importedWallets.map((wallet, index) => ({
      ...wallet,
      id: `imported-${offset + index + 1}`,
    })),
  ];
}

function settingSpeedLabel(speed: GlobalSettings["speed"]) {
  return speed === "turbo" ? "Turbo" : "Fast";
}

function settingJitoLabel(jitoTip: GlobalSettings["jitoTip"]) {
  return jitoTip === "default" ? "Default" : `${jitoTip} SOL`;
}

function onPurchaseLabel(value: Extract<ActivePreview, { kind: "volume_bot" }>["onPurchase"]) {
  return value === "auto_sell" ? "Auto sell" : "Return to wallet";
}

function sellTimingLabel(value: Extract<ActivePreview, { kind: "volume_bot" }>["sellTiming"]) {
  return value === "after_each" ? "After each" : "After all";
}

function sellModeLabel(value: Extract<ActivePreview, { kind: "volume_bot" }>["sellMode"]) {
  return value === "sell_strategy" ? "Sell strategy" : "Sell 100";
}

function directionLabel(direction: BundleSwapPreviewState["direction"]) {
  if (direction === "sol_to_token") {
    return "SOL to token";
  }
  if (direction === "token_to_sol") {
    return "Token to SOL";
  }

  return "Token to token";
}

function perTxOverrideLabel(
  overrides: BundleSwapPreviewState["perTxOverrides"],
) {
  const parts = [
    overrides.slippagePct !== undefined
      ? `slippage ${overrides.slippagePct}%`
      : null,
    overrides.gas !== undefined ? `gas ${overrides.gas}` : null,
    overrides.priority !== undefined ? `priority ${overrides.priority}` : null,
    overrides.mevShield !== undefined
      ? `MEV ${overrides.mevShield ? "on" : "off"}`
      : null,
  ].filter(Boolean);

  return parts.length ? parts.join(", ") : "Defaults";
}

function plannedAmountLabel(quantityModeLabel: string, amount: number) {
  return quantityModeLabel.includes("%") ? `${amount}%` : `${amount} SOL`;
}

function walletStatusLabel(
  status: BundleSwapPreviewState["perWallet"][number]["status"],
) {
  if (status === "skip_no_token") {
    return "No token";
  }
  if (status === "skip_no_sol_for_fees") {
    return "No fee SOL";
  }

  return "Ready";
}
