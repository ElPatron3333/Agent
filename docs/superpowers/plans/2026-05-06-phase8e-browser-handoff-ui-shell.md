# Phase 8E Browser Handoff UI Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a non-executing browser handoff UI shell for Smithii Pump Bundle Launch and supported Bundle Swap previews.

**Architecture:** Add a tested, non-secret UI model helper in `src/lib/smithii/browser-handoff-ui.ts`, then render that model from the existing confirmation/live-boundary area in `src/components/smithii-agent-app.tsx`. The shell stays informational and disabled; it must not import or call the Phase 8D executor and must not modify backend routes.

**Tech Stack:** TypeScript, React, Next.js App Router client component, Vitest, existing Smithii live-boundary and mock-chat types.

---

## File Structure

- Create `src/lib/smithii/browser-handoff-ui.ts`: pure helper that derives a non-secret `BrowserHandoffUiModel` from `ActivePreview`, `PendingPlan`, and `SmithiiLiveBoundary`.
- Create `tests/unit/smithii-browser-handoff-ui.test.ts`: focused helper tests for ready, blocked, unavailable, and secret-label cases.
- Modify `src/components/smithii-agent-app.tsx`: render the helper model in the existing confirmation gate area using a disabled informational control.
- Do not modify `src/app/api/chat/route.ts` or call/import `src/lib/smithii/pump-browser-executor.ts` from the UI shell.

## Task 1: Browser Handoff UI Model Helper

**Files:**
- Create: `tests/unit/smithii-browser-handoff-ui.test.ts`
- Create: `src/lib/smithii/browser-handoff-ui.ts`

- [ ] **Step 1: Write failing tests for handoff-ready and blocked model derivation**

Create `tests/unit/smithii-browser-handoff-ui.test.ts` with this content:

```typescript
import { describe, expect, it } from "vitest";

import type { ActivePreview, PendingPlan } from "../../src/lib/agent/mock-chat";
import type { SmithiiLiveBoundary } from "../../src/lib/smithii/live-boundary";
import { browserHandoffUiModel } from "../../src/lib/smithii/browser-handoff-ui";

const globalSettings = {
  speed: "fast",
  jitoTip: "default",
  mevProtection: true,
  slippagePct: 10,
} as const;

describe("Smithii browser handoff UI model", () => {
  it("returns a non-secret Bundle Launch handoff shell model", () => {
    const model = browserHandoffUiModel({
      activePreview: bundleLaunchPreview(),
      pendingPlan: pendingPlan("bundle_launch"),
      smithiiLive: boundary("browser-handoff-ready", "PumpFunClient.createAndSnipeToken"),
    });

    expect(model).toEqual({
      status: "Ready for browser handoff setup",
      flowLabel: "Bundle Launch",
      planId: "plan_bundle_launch_2_0_30",
      sdkMethod: "PumpFunClient.createAndSnipeToken",
      disabledActionLabel: "Browser handoff not wired",
      requiredMaterials: [
        "Token metadata image",
        "Generated mint keypair",
        "Connected dev wallet signer",
        "Browser-held bundle wallet material",
      ],
    });
    expect(JSON.stringify(model)).not.toMatch(secretLabelPattern);
  });

  it("returns a non-secret Bundle Swap handoff shell model", () => {
    const model = browserHandoffUiModel({
      activePreview: bundleSwapPreview("sol_to_token"),
      pendingPlan: pendingPlan("bundle_swap"),
      smithiiLive: boundary("browser-handoff-ready", "PumpFunClient.bundleSellBuy"),
    });

    expect(model).toEqual({
      status: "Ready for browser handoff setup",
      flowLabel: "Bundle Swap",
      planId: "plan_bundle_swap_sol_to_token_2_abc",
      sdkMethod: "PumpFunClient.bundleSellBuy",
      disabledActionLabel: "Browser handoff not wired",
      requiredMaterials: [
        "Token mint address",
        "Connected fee wallet signer",
        "Browser-held participating wallet material",
        "Per-wallet amounts",
      ],
    });
    expect(JSON.stringify(model)).not.toMatch(secretLabelPattern);
  });

  it.each([
    ["missing preview", null, pendingPlan("bundle_launch"), boundary("browser-handoff-ready", "PumpFunClient.createAndSnipeToken")],
    ["missing pending plan", bundleLaunchPreview(), null, boundary("browser-handoff-ready", "PumpFunClient.createAndSnipeToken")],
    ["mock boundary", bundleLaunchPreview(), pendingPlan("bundle_launch"), boundary("mock", "Mock: PumpFunClient.createAndSnipeToken")],
    ["token-to-token swap", bundleSwapPreview("token_to_token"), pendingPlan("bundle_swap"), boundary("blocked-awaiting-smithii", "PumpFunClient.bundleSellBuy")],
    ["volume bot", volumeBotPreview(), pendingPlan("volume_bot"), boundary("blocked-awaiting-smithii", "market_maker_bot_ HTTP endpoints")],
    ["launch plus volume", launchVolumeSequencePreview(), pendingPlan("launch_volume_sequence"), boundary("blocked-awaiting-smithii", "Composite: Bundle Launch + Volume Bot")],
  ])("returns null for %s", (_label, activePreview, pendingPlanValue, smithiiLive) => {
    expect(
      browserHandoffUiModel({
        activePreview,
        pendingPlan: pendingPlanValue,
        smithiiLive,
      }),
    ).toBeNull();
  });
});

const secretLabelPattern = /\b(pk|privKeys|privateKey|privateKeys|secretKey|mnemonic|seedPhrase)\b/i;

function boundary(
  mode: SmithiiLiveBoundary["mode"],
  sdkMethod: string,
): SmithiiLiveBoundary {
  return {
    mode,
    serverExecution: "blocked",
    sdkPackage: "@smithii/sdk",
    sdkMethod,
    browserRequiredSignerArgs: ["bundle buyer signer material"],
    blockers: mode === "blocked-awaiting-smithii" ? ["Blocked"] : [],
    questionsForSmithii: [],
  };
}

function pendingPlan(tool: PendingPlan["tool"]): PendingPlan {
  return {
    id: tool === "bundle_launch"
      ? "plan_bundle_launch_2_0_30"
      : tool === "bundle_swap"
        ? "plan_bundle_swap_sol_to_token_2_abc"
        : tool === "volume_bot"
          ? "bot_volume_200_Mint111_abc"
          : "sequence_launch_volume_momentum_v1_5_abc",
    tool,
    expiresAt: "2026-05-06T08:05:00.000Z",
  };
}

function bundleLaunchPreview(): Extract<ActivePreview, { kind: "bundle_launch" }> {
  return {
    kind: "bundle_launch",
    planId: "plan_bundle_launch_2_0_30",
    token: "Blue Frog / BFROG",
    totalBuysSol: 0.3,
    serviceFeeSol: 0.1,
    devWalletFeesSol: 0.1,
    devWalletPubkey: "DevWallet...91nP",
    bundleWallets: [
      { pubkey: "wallet111", buyAmountSol: 0.1 },
      { pubkey: "wallet222", buyAmountSol: 0.2 },
    ],
    imageFileName: "blue-frog.png",
    socialsEnabled: false,
    socials: {},
    modifiers: {
      cashbackCoin: false,
      useDifferentBlocks: true,
      pregenerateTokenAddress: false,
    },
    globalSettings,
    summary: "Bundle launch for BFROG with 2 bundle wallets.",
  };
}

function bundleSwapPreview(
  direction: Extract<ActivePreview, { kind: "bundle_swap" }>["direction"],
): Extract<ActivePreview, { kind: "bundle_swap" }> {
  return {
    kind: "bundle_swap",
    planId: "plan_bundle_swap_sol_to_token_2_abc",
    direction,
    fromToken: direction === "sol_to_token" ? "SOL" : "Mint111",
    toToken: direction === "token_to_sol" ? "SOL" : "Mint222",
    routing: "pumpfun_bonding",
    serviceFeeSol: 0.1,
    walletCount: 2,
    readyWallets: 2,
    skippedWallets: 0,
    quantityModeLabel: "Fixed 0.1 SOL per tx",
    txCount: 2,
    txDelayBlocks: 1,
    estimatedIntervalS: 0.4,
    estimatedTotalS: 0.8,
    perTxOverrides: {},
    perWallet: [
      {
        pubkey: "wallet111",
        solBalance: 1,
        tokenBalance: 0,
        plannedAmountSolOrPct: 0.1,
        status: "ready",
      },
      {
        pubkey: "wallet222",
        solBalance: 1,
        tokenBalance: 0,
        plannedAmountSolOrPct: 0.1,
        status: "ready",
      },
    ],
    globalSettings,
    summary: "Bundle swap across 2 wallets.",
  };
}

function volumeBotPreview(): Extract<ActivePreview, { kind: "volume_bot" }> {
  return {
    kind: "volume_bot",
    botId: "bot_volume_200_Mint111_abc",
    tokenAddress: "Mint111",
    volumeWalletPubkey: "VolumeWallet...5sTq",
    makers: 200,
    orderAmount: { minSol: 0.01, maxSol: 0.02 },
    delaySeconds: { min: 10, max: 20 },
    onPurchase: "auto_sell",
    sellTiming: "after_each",
    sellMode: "sell_100",
    serviceFeeSol: 0.05,
    estimatedTotalFeesSol: 3.05,
    expectedDurationText: "200 makers, 10-20s delay",
    globalSettings,
    summary: "Volume bot for Mint111 with 200 makers.",
  };
}

function launchVolumeSequencePreview(): Extract<ActivePreview, { kind: "launch_volume_sequence" }> {
  return {
    kind: "launch_volume_sequence",
    sequenceId: "sequence_launch_volume_momentum_v1_5_abc",
    token: "Blue Frog / BFROG",
    templateId: "momentum_v1",
    templateName: "Momentum",
    delayMinutes: 5,
    launch: {
      bundleWalletCount: 2,
      totalBuysSol: 0.6,
      serviceFeeSol: 0.1,
    },
    volume: {
      volumeWalletPubkey: "VolumeWallet...5sTq",
      makers: 250,
      serviceFeeSol: 0.063,
      estimatedTotalFeesSol: 4.125,
    },
    globalSettings,
    summary: "Momentum sequence.",
  };
}
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm vitest run tests/unit/smithii-browser-handoff-ui.test.ts`

Expected: FAIL because `src/lib/smithii/browser-handoff-ui.ts` does not exist.

- [ ] **Step 3: Implement the minimal UI model helper**

Create `src/lib/smithii/browser-handoff-ui.ts` with this content:

```typescript
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
```

- [ ] **Step 4: Run tests and verify GREEN**

Run: `pnpm vitest run tests/unit/smithii-browser-handoff-ui.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

Run:

```bash
git add src/lib/smithii/browser-handoff-ui.ts tests/unit/smithii-browser-handoff-ui.test.ts
git commit -m "Add Phase 8E browser handoff UI model"
```

## Task 2: Render The Non-Executing Shell In The Client App

**Files:**
- Modify: `src/components/smithii-agent-app.tsx`
- Modify: `tests/unit/smithii-browser-handoff-ui.test.ts`

- [ ] **Step 1: Add a model-level guard test for plan/preview mismatch**

Append this test inside the `describe` block in `tests/unit/smithii-browser-handoff-ui.test.ts`:

```typescript
  it("does not render a model when the pending plan tool does not match the preview", () => {
    expect(
      browserHandoffUiModel({
        activePreview: bundleLaunchPreview(),
        pendingPlan: pendingPlan("bundle_swap"),
        smithiiLive: boundary("browser-handoff-ready", "PumpFunClient.createAndSnipeToken"),
      }),
    ).toBeNull();
  });
```

- [ ] **Step 2: Run tests and verify GREEN before UI edit**

Run: `pnpm vitest run tests/unit/smithii-browser-handoff-ui.test.ts`

Expected: PASS. This test documents a UI safety invariant before rendering the model.

- [ ] **Step 3: Render the handoff shell in `SmithiiAgentApp`**

In `src/components/smithii-agent-app.tsx`, add the import:

```typescript
import {
  browserHandoffUiModel,
  type BrowserHandoffUiModel,
} from "@/lib/smithii/browser-handoff-ui";
```

Inside `SmithiiAgentApp`, after `activeVolumeWalletPubkey` is computed, add:

```typescript
  const browserHandoff = browserHandoffUiModel({
    activePreview,
    pendingPlan,
    smithiiLive,
  });
```

Inside the existing `Panel title="Confirmation Gate"`, after the existing `liveBoundaryText(smithiiLive)` paragraph, render:

```tsx
                  {browserHandoff ? (
                    <BrowserHandoffPanel model={browserHandoff} />
                  ) : null}
```

Add this component near the existing small component helpers:

```tsx
function BrowserHandoffPanel({ model }: { model: BrowserHandoffUiModel }) {
  return (
    <div className="mt-4 rounded-md border border-emerald-900/80 bg-emerald-950/20 p-3">
      <PreviewRow label="Handoff status" value={model.status} />
      <PreviewRow label="Flow" value={model.flowLabel} />
      <PreviewRow label="SDK method" value={model.sdkMethod} />
      <PreviewRow label="Plan" value={model.planId} />
      <div className="mt-3">
        <p className="text-xs uppercase text-slate-500">Required in browser</p>
        <ul className="mt-2 space-y-1 text-sm text-slate-300">
          {model.requiredMaterials.map((material) => (
            <li key={material}>{material}</li>
          ))}
        </ul>
      </div>
      <button
        className="mt-3 h-9 w-full cursor-not-allowed rounded-md border border-emerald-800 px-3 text-sm font-semibold text-emerald-100 opacity-70"
        type="button"
        disabled
      >
        {model.disabledActionLabel}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Verify focused tests after UI edit**

Run: `pnpm vitest run tests/unit/smithii-browser-handoff-ui.test.ts tests/unit/client-chat-state.test.ts tests/unit/smithii-live-boundary.test.ts`

Expected: PASS.

- [ ] **Step 5: Verify no forbidden imports were added**

Run:

```bash
rg -n "pump-browser-executor" src/app src/components
```

Expected: no matches in `src/app` or `src/components`.

- [ ] **Step 6: Commit Task 2**

Run:

```bash
git add src/components/smithii-agent-app.tsx tests/unit/smithii-browser-handoff-ui.test.ts
git commit -m "Render Phase 8E browser handoff shell"
```

## Task 3: Final Phase Verification

**Files:**
- Verify: entire worktree

- [ ] **Step 1: Run targeted phase tests**

Run:

```bash
pnpm vitest run tests/unit/smithii-browser-handoff-ui.test.ts tests/unit/client-chat-state.test.ts tests/unit/smithii-live-boundary.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full verification**

Run:

```bash
pnpm test
pnpm lint
pnpm build
git diff --check
```

Expected: all commands PASS.

- [ ] **Step 3: Verify branch status**

Run: `git status --short --branch`

Expected: clean branch with committed Phase 8E changes.

- [ ] **Step 4: Push Phase 8E branch**

Run: `git push -u origin feature/phase8e-browser-handoff-ui-shell`

Expected: branch pushed to GitHub.
