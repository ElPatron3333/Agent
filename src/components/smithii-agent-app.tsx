"use client";

import type { ChangeEvent, FormEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import type {
  ActivePreview,
  ChatMessage,
  Draft,
  MockChatResult,
  PendingPlan,
} from "@/lib/agent/mock-chat";
import {
  chatErrorStateForResponse,
  nextActivePreview,
} from "@/lib/agent/client-chat-state";
import type { AuditLogRecord } from "@/lib/audit-log-types";
import type { GlobalSettings } from "@/lib/smithii/types";
import { BundleLaunchPreview } from "@/components/previews/bundle-launch-preview";
import {
  DEFAULT_GLOBAL_SETTINGS,
  clampSlippageInput,
  readStoredGlobalSettings,
  writeStoredGlobalSettings,
} from "@/lib/global-settings";
import {
  buildLaunchWalletSelection,
  buildSwapWalletSelection,
  createDemoWalletRoster,
  exportPrivateKeyCsv,
  parsePrivateKeyCsv,
  toPublicWalletRows,
  type BrowserWalletEntry,
} from "@/lib/wallet-roster";

const initialMessages: ChatMessage[] = [
  {
    role: "assistant",
    text: "Tell me to prepare a Bundle Launch, Bundle Swap, or Volume Bot. I will show a preview before any mock execution.",
  },
];

type BundleSwapPreviewState = Extract<ActivePreview, { kind: "bundle_swap" }>;

const defaultPreview: ActivePreview = {
  kind: "bundle_launch",
  planId: "No active plan",
  token: "Signal Cat / SCAT",
  totalBuysSol: 1.75,
  serviceFeeSol: 0.1,
  devWalletFeesSol: 0.2,
  devWalletPubkey: "DevWallet...91nP",
  bundleWallets: [
    { pubkey: "BndlWallet...4kd9", buyAmountSol: 0.5 },
    { pubkey: "BndlWallet...8qa2", buyAmountSol: 0.5 },
    { pubkey: "BndlWallet...2mwp", buyAmountSol: 0.5 },
  ],
  imageFileName: "signal-cat.png",
  socialsEnabled: false,
  socials: {},
  modifiers: {
    cashbackCoin: false,
    useDifferentBlocks: true,
    pregenerateTokenAddress: true,
  },
  globalSettings: DEFAULT_GLOBAL_SETTINGS,
  summary: "Ask for a launch preview to prepare a fresh plan.",
};

export function SmithiiAgentApp() {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [walletRoster, setWalletRoster] = useState<BrowserWalletEntry[]>(
    createDemoWalletRoster,
  );
  const [input, setInput] = useState(
    "launch a token called Blue Frog with a 3-wallet bundle",
  );
  const [pendingPlan, setPendingPlan] = useState<PendingPlan | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings>(
    getInitialGlobalSettings,
  );
  const [activePreview, setActivePreview] =
    useState<ActivePreview | null>(defaultPreview);
  const [executionStatus, setExecutionStatus] = useState("Waiting for preview");
  const [auditLog, setAuditLog] = useState<AuditLogRecord[]>([]);
  const [walletImportStatus, setWalletImportStatus] =
    useState("Private keys stay in browser state.");
  const [isSending, setIsSending] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void refreshAuditLog();
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

  function updateGlobalSettings(
    updater: (current: GlobalSettings) => GlobalSettings,
  ) {
    setGlobalSettings((current) => {
      const next = updater(current);
      if (typeof window !== "undefined") {
        writeStoredGlobalSettings(window.sessionStorage, next);
      }
      return next;
    });
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
          swapWalletSelection: swapSelectionForDraftOrIntent(
            draft,
            walletRoster,
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
        }
        if (errorState.executionStatus) {
          setExecutionStatus(errorState.executionStatus);
        }
        throw new Error(errorState.message);
      }

      const result = (await response.json()) as MockChatResult;
      setMessages((current) => [...current, result.assistantMessage]);
      setPendingPlan(result.pendingPlan);
      setDraft(result.draft);
      setActivePreview((current) => nextActivePreview(result, current));
      setExecutionStatus(result.executionStatus);
      void refreshAuditLog();
    } catch (error) {
      const message =
        error instanceof Error &&
        (error.message === "Not enough bundle wallets are available." ||
          error.message === "Bundle Swap wallet count must be a whole number from 1 to 20." ||
          error.message === "A dev wallet is required for Bundle Launch." ||
          error.message === "Invalid pending plan.")
          ? error.message
          : "The mock chat route failed. Check the dev logs and try again.";
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

  return (
    <main className="min-h-screen bg-[#070a0a] text-slate-100">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[320px_1fr]">
        <aside className="border-b border-cyan-950/80 bg-[#050707] p-4 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
                Smithii Agent
              </p>
              <h1 className="mt-2 text-2xl font-semibold text-white">
                Pump.fun terminal
              </h1>
            </div>
            <div className="h-3 w-3 rounded-full bg-emerald-400" />
          </div>

          <section className="mt-8">
            <h2 className="text-sm font-semibold text-slate-200">Session</h2>
            <div className="mt-3 space-y-2 text-sm text-slate-300">
              <PreviewRow label="Dex" value="PumpFun" />
              <PreviewRow
                label="Wallets"
                value={`${walletRoster.length} loaded`}
              />
              <PreviewRow label="Mode" value="Mock" />
            </div>
          </section>

          <section className="mt-8">
            <h2 className="text-sm font-semibold text-slate-200">Logs</h2>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <span className="rounded-md border border-cyan-900/80 px-2 py-2 text-center text-cyan-200">
                bundler
              </span>
              <span className="rounded-md border border-cyan-900/80 px-2 py-2 text-center text-cyan-200">
                volume
              </span>
              <span className="rounded-md border border-cyan-900/80 px-2 py-2 text-center text-cyan-200">
                swap
              </span>
            </div>
          </section>
        </aside>

        <section className="flex min-w-0 flex-col">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-cyan-950/80 px-5 py-4">
            <nav className="flex gap-1 text-sm">
              {["Bundle Launch", "Bundle Swap", "Volume"].map((item) => (
                <button
                  key={item}
                  className="h-9 rounded-md border border-cyan-900/80 px-3 text-cyan-100 transition hover:border-cyan-400"
                  type="button"
                  onClick={() => setInput(item.toLowerCase())}
                >
                  {item}
                </button>
              ))}
            </nav>
            <button
              className="h-9 rounded-md bg-cyan-500 px-4 text-sm font-semibold text-slate-950"
              type="button"
            >
              Connect Wallet
            </button>
          </header>

          <div className="grid flex-1 grid-cols-1 gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_420px]">
            <section className="min-w-0">
              <Metrics preview={activePreview} />

              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                <PreviewPanel preview={activePreview} />
                <Panel title="Confirmation Gate">
                  <PreviewRow
                    label="Active plan"
                    value={pendingPlan ? pendingPlan.tool : "None"}
                  />
                  <PreviewRow label="Draft" value={draftSummary(draft)} />
                  <PreviewRow
                    label="Plan TTL"
                    value={pendingPlan ? "5 minutes" : "No plan"}
                  />
                  <PreviewRow label="Execute words" value="confirm, launch, start" />
                  <p className="mt-4 rounded-md border border-cyan-950/80 p-3 text-sm leading-6 text-slate-300">
                    Mock execution only happens after a preview is prepared and a
                    confirm word is sent through chat.
                  </p>
                </Panel>
              </div>

              <Panel className="mt-4" title="Wallet Roster">
                <input
                  ref={importInputRef}
                  className="hidden"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={importPrivateKeys}
                />
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-left text-sm">
                    <thead className="text-xs uppercase text-slate-500">
                      <tr>
                        <th className="py-2">Wallet</th>
                        <th className="py-2">SOL</th>
                        <th className="py-2">Token</th>
                        <th className="py-2">% supply</th>
                        <th className="py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-cyan-950/70">
                      {toPublicWalletRows(walletRoster).map((wallet) => (
                        <tr key={wallet.id}>
                          <td className="py-3 text-slate-200">{wallet.pubkey}</td>
                          <td className="py-3">{wallet.solBalance.toFixed(2)}</td>
                          <td className="py-3">{wallet.tokenBalance}</td>
                          <td className="py-3">
                            {wallet.pctOfSupply.toFixed(1)}
                          </td>
                          <td className="py-3">
                            <span className="rounded-md bg-slate-900 px-2 py-1 text-xs text-cyan-200">
                              {wallet.role}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-4 text-sm text-slate-400">
                  {walletImportStatus}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    className="h-9 rounded-md border border-cyan-700 px-3 text-sm font-semibold text-cyan-100"
                    type="button"
                    onClick={() => setWalletRoster((current) => addMockWallet(current))}
                  >
                    New mock wallet
                  </button>
                  <button
                    className="h-9 rounded-md border border-rose-900 px-3 text-sm font-semibold text-rose-200"
                    type="button"
                    onClick={() => {
                      setWalletRoster(createDemoWalletRoster());
                      setWalletImportStatus("Private keys stay in browser state.");
                    }}
                  >
                    Reset roster
                  </button>
                  <button
                    className="h-9 rounded-md border border-cyan-700 px-3 text-sm font-semibold text-cyan-100"
                    type="button"
                    onClick={() => importInputRef.current?.click()}
                  >
                    Import PKs
                  </button>
                  <button
                    className="h-9 rounded-md border border-cyan-700 px-3 text-sm font-semibold text-cyan-100"
                    type="button"
                    onClick={exportPrivateKeys}
                  >
                    Export PKs
                  </button>
                </div>
              </Panel>
            </section>

            <aside className="min-w-0">
              <Panel title="Chat">
                <div className="max-h-[440px] space-y-3 overflow-y-auto pr-1">
                  {messages.map((message, index) => (
                    <div
                      key={`${message.role}-${index}`}
                      className="rounded-md border border-cyan-950/70 bg-[#090f0f] p-3"
                    >
                      <p className="text-xs font-semibold uppercase text-cyan-300">
                        {message.role}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-300">
                        {message.text}
                      </p>
                    </div>
                  ))}
                </div>
                <form className="mt-4 flex gap-2" onSubmit={sendMessage}>
                  <input
                    className="h-10 min-w-0 flex-1 rounded-md border border-cyan-950/80 bg-black px-3 text-sm text-slate-100 outline-none focus:border-cyan-400"
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                  />
                  <button
                    className="h-10 rounded-md border border-cyan-500 px-3 text-sm font-semibold text-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
                    type="submit"
                    disabled={isSending}
                  >
                    {isSending ? "..." : "Send"}
                  </button>
                </form>
              </Panel>

              <Panel className="mt-4" title="Execution">
                <PreviewRow label="Status" value={executionStatus} />
                <PreviewRow
                  label="Plan ID"
                  value={pendingPlan?.id ?? activePreviewId(activePreview)}
                />
                <PreviewRow
                  label="Preview"
                  value={activePreview?.kind ?? "No preview"}
                />
                <PreviewRow label="Draft" value={draftSummary(draft)} />
              </Panel>

              <Panel className="mt-4" title="Audit Log">
                <div className="space-y-3">
                  {auditLog.slice(-4).reverse().map((record) => (
                    <div
                      key={record.id}
                      className="rounded-md border border-cyan-950/70 bg-black/40 p-3 text-sm"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium text-slate-100">
                          {auditEventLabel(record.event)}
                        </span>
                        <span className="text-xs text-slate-500">
                          {record.tool ?? "unknown"}
                        </span>
                      </div>
                      <p className="mt-2 truncate text-xs text-cyan-200">
                        {record.planId}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {record.outcome}
                      </p>
                    </div>
                  ))}
                  {auditLog.length === 0 ? (
                    <p className="text-sm text-slate-400">No audit records</p>
                  ) : null}
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    className="h-9 rounded-md border border-cyan-700 px-3 text-sm font-semibold text-cyan-100"
                    type="button"
                    onClick={() => void refreshAuditLog()}
                  >
                    Refresh
                  </button>
                  <button
                    className="h-9 rounded-md border border-cyan-700 px-3 text-sm font-semibold text-cyan-100"
                    type="button"
                    onClick={() => exportAuditLog(auditLog)}
                    disabled={auditLog.length === 0}
                  >
                    Export JSON
                  </button>
                </div>
              </Panel>

              <Panel className="mt-4" title="Global Settings">
                <div className="space-y-4">
                  <div>
                    <p className="mb-2 text-xs uppercase text-slate-500">Speed</p>
                    <div className="grid grid-cols-2 gap-2">
                      {(["fast", "turbo"] as const).map((speed) => (
                        <button
                          key={speed}
                          className={`h-9 rounded-md border px-3 text-sm font-semibold ${
                            globalSettings.speed === speed
                              ? "border-cyan-400 bg-cyan-500 text-slate-950"
                              : "border-cyan-900/80 text-cyan-100"
                          }`}
                          type="button"
                          onClick={() =>
                            updateGlobalSettings((current) => ({
                              ...current,
                              speed,
                            }))
                          }
                        >
                          {speed === "turbo" ? "Turbo" : "Fast"}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="block text-sm text-slate-300">
                    <span className="mb-2 block text-xs uppercase text-slate-500">
                      Jito tip
                    </span>
                    <select
                      className="h-9 w-full rounded-md border border-cyan-950/80 bg-black px-3 text-sm text-slate-100 outline-none focus:border-cyan-400"
                      value={String(globalSettings.jitoTip)}
                      onChange={(event) =>
                        updateGlobalSettings((current) => ({
                          ...current,
                          jitoTip:
                            event.target.value === "default"
                              ? "default"
                              : Number(event.target.value),
                        }))
                      }
                    >
                      <option value="default">Default</option>
                      <option value="0.001">0.001 SOL</option>
                      <option value="0.004">0.004 SOL</option>
                      <option value="0.01">0.01 SOL</option>
                    </select>
                  </label>

                  <label className="flex items-center justify-between gap-4 border-b border-cyan-950/70 py-2 text-sm">
                    <span className="text-slate-500">MEV protection</span>
                    <input
                      checked={globalSettings.mevProtection}
                      className="h-4 w-4 accent-cyan-400"
                      type="checkbox"
                      onChange={(event) =>
                        updateGlobalSettings((current) => ({
                          ...current,
                          mevProtection: event.target.checked,
                        }))
                      }
                    />
                  </label>

                  <label className="block text-sm text-slate-300">
                    <span className="mb-2 block text-xs uppercase text-slate-500">
                      Slippage %
                    </span>
                    <input
                      className="h-9 w-full rounded-md border border-cyan-950/80 bg-black px-3 text-sm text-slate-100 outline-none focus:border-cyan-400"
                      min={1}
                      max={100}
                      step={1}
                      type="number"
                      value={globalSettings.slippagePct}
                      onChange={(event) =>
                        updateGlobalSettings((current) => ({
                          ...current,
                          slippagePct: clampSlippageInput(event.target.value),
                        }))
                      }
                    />
                  </label>
                </div>
              </Panel>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}

function getInitialGlobalSettings() {
  if (typeof window === "undefined") {
    return DEFAULT_GLOBAL_SETTINGS;
  }

  return readStoredGlobalSettings(window.sessionStorage);
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
    return "Mock executed";
  }
  if (event === "confirmation_rejected") {
    return "Confirm rejected";
  }
  if (event === "confirmation_expired") {
    return "Confirm expired";
  }

  return "Preview prepared";
}

async function responseErrorMessage(response: Response) {
  try {
    const body = (await response.json()) as { error?: unknown };
    return typeof body.error === "string" ? body.error : null;
  } catch {
    return null;
  }
}

function Metrics({ preview }: { preview: ActivePreview | null }) {
  const values = metricValues(preview);

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Metric label={values[0].label} value={values[0].value} tone="cyan" />
      <Metric label={values[1].label} value={values[1].value} tone="amber" />
      <Metric label={values[2].label} value={values[2].value} tone="emerald" />
    </div>
  );
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
        <PreviewRow
          label="Service fee"
          value={`${preview.serviceFeeSol.toFixed(2)} SOL`}
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
                  <td className="py-2">{wallet.plannedAmountSolOrPct}</td>
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

  return (
    <Panel title="Volume Bot Preview">
      <PreviewRow label="Makers" value={String(preview.makers)} />
      <PreviewRow
        label="Service fee"
        value={`${preview.serviceFeeSol.toFixed(3)} SOL`}
      />
      <PreviewRow
        label="Estimated total"
        value={`${preview.estimatedTotalFeesSol.toFixed(3)} SOL`}
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
      <PreviewRow label="Sell mode" value="Strategy" />
      <p className="mt-4 rounded-md border border-cyan-950/80 p-3 text-sm text-slate-300">
        {preview.summary}
      </p>
    </Panel>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "cyan" | "amber" | "emerald";
}) {
  const toneClass = {
    cyan: "text-cyan-200",
    amber: "text-amber-200",
    emerald: "text-emerald-200",
  }[tone];

  return (
    <div className="rounded-md border border-cyan-950/80 bg-[#091010] p-4">
      <p className="text-xs uppercase text-slate-500">{label}</p>
      <p className={`mt-2 text-xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
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
      className={`rounded-md border border-cyan-950/80 bg-[#070d0d] p-4 ${className}`}
    >
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-cyan-950/70 py-2 text-sm last:border-b-0">
      <span className="text-slate-500">{label}</span>
      <span className="overflow-hidden text-ellipsis text-right font-medium text-slate-100">
        {value}
      </span>
    </div>
  );
}

function activePreviewId(preview: ActivePreview | null) {
  if (!preview) {
    return "None";
  }

  return preview.kind === "volume_bot" ? preview.botId : preview.planId;
}

function draftSummary(draft: Draft | null) {
  if (!draft) {
    return "None";
  }

  if (draft.tool === "bundle_swap") {
    const data = draft.data;
    if (!data.direction) {
      return "Waiting for direction";
    }
    if (!data.fromToken || !data.toToken) {
      return "Waiting for tokens";
    }
    if (!data.walletCount) {
      return "Waiting for wallet count";
    }
    if (!data.quantityMode) {
      return "Waiting for quantity";
    }
    if (!data.txCount) {
      return "Waiting for TX count";
    }
    if (data.txDelayBlocks === undefined) {
      return "Waiting for delay";
    }

    return "Ready for swap preview";
  }

  const data = draft.data;
  if (!data.tokenName) {
    return "Waiting for name";
  }
  if (!data.symbol) {
    return "Waiting for symbol";
  }
  if (!data.description) {
    return "Waiting for description";
  }
  if (!data.walletCount) {
    return "Waiting for wallet count";
  }
  if (!data.solPerWallet) {
    return "Waiting for SOL amount";
  }

  return "Ready for preview";
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
      : /\b(sell|swap|dump)\b/i.test(message)
        ? 3
        : null;

  if (!walletCount) {
    return null;
  }

  return buildSwapWalletSelection({
    roster: walletRoster,
    walletCount,
  });
}

function addMockWallet(current: BrowserWalletEntry[]) {
  const nextIndex = current.filter((wallet) => wallet.role === "bundle").length + 1;

  return [
    ...current,
    {
      id: `bundle-${nextIndex}`,
      pubkey: `BndlWallet...new${nextIndex}`,
      privateKey: demoPrivateKeyForIndex(nextIndex),
      solBalance: 0.75,
      tokenBalance: 0,
      pctOfSupply: 0,
      role: "bundle" as const,
    },
  ];
}

function demoPrivateKeyForIndex(index: number) {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const suffix = alphabet[index % alphabet.length];
  return `4DemoPrivateKeyNew${suffix}${"1".repeat(44)}`;
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

function metricValues(preview: ActivePreview | null) {
  if (preview?.kind === "bundle_swap") {
    return [
      { label: "Swap fee", value: `${preview.serviceFeeSol.toFixed(2)} SOL` },
      { label: "Ready", value: `${preview.readyWallets}/${preview.walletCount}` },
      { label: "Skipped", value: String(preview.skippedWallets) },
    ];
  }

  if (preview?.kind === "volume_bot") {
    return [
      { label: "Makers", value: String(preview.makers) },
      { label: "Volume fee", value: `${preview.serviceFeeSol.toFixed(3)} SOL` },
      {
        label: "Est. total",
        value: `${preview.estimatedTotalFeesSol.toFixed(2)} SOL`,
      },
    ];
  }

  if (preview?.kind === "bundle_launch") {
    return [
      { label: "Launch fee", value: `${preview.serviceFeeSol.toFixed(2)} SOL` },
      {
        label: "Bundle buys",
        value: `${preview.totalBuysSol.toFixed(2)} SOL`,
      },
      {
        label: "Dev fees",
        value: `${preview.devWalletFeesSol.toFixed(2)} SOL`,
      },
    ];
  }

  return [
    { label: "Launch fee", value: "0.10 SOL" },
    { label: "Swap fee", value: "0.10 SOL" },
    { label: "Volume fee", value: "0.025 SOL" },
  ];
}
