# Phase 8A Live Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Smithii Phase 8A live-execution boundary that makes browser-only handoff readiness explicit while keeping backend live execution blocked and mock execution as the default.

**Architecture:** Add a small typed `live-boundary` module under `src/lib/smithii/` that classifies each active preview as `mock`, `browser-handoff-ready`, or `blocked-awaiting-smithii`. The backend mock agent will attach this status to previews and execution responses without accepting private keys or calling live Smithii SDK methods. Existing SDK adapter mappings remain the low-level argument mappers.

**Tech Stack:** TypeScript, Next.js route handlers, Vitest unit tests, existing `@smithii/sdk` type-only adapter.

---

### Task 1: Add the Live Boundary Contract

**Files:**
- Create: `src/lib/smithii/live-boundary.ts`
- Test: `tests/unit/smithii-live-boundary.test.ts`

- [ ] **Step 1: Write failing tests**

Create tests that expect:

```ts
import { describe, expect, it } from "vitest";

import {
  liveBoundaryForPreview,
  requireServerLiveExecutionBlocked,
} from "../../src/lib/smithii/live-boundary";
import type { ActivePreview } from "../../src/lib/agent/mock-chat";

it("marks bundle launch as browser handoff ready but not server executable", () => {
  const boundary = liveBoundaryForPreview(bundleLaunchPreview());

  expect(boundary.mode).toBe("browser-handoff-ready");
  expect(boundary.serverExecution).toBe("blocked");
  expect(boundary.browserRequiredSignerArgs).toContain("buyers[].pk");
});

it("blocks token-to-token bundle swap live handoff", () => {
  const boundary = liveBoundaryForPreview({
    ...bundleSwapPreview(),
    direction: "token_to_token",
    fromToken: "SourceMint111",
    toToken: "TargetMint222",
  });

  expect(boundary.mode).toBe("blocked-awaiting-smithii");
  expect(boundary.blockers).toContain("@smithii/sdk/pump bundleSellBuy does not expose token-to-token swaps.");
});

it("keeps volume bot live handoff blocked until Smithii confirms unresolved SDK fields", () => {
  const boundary = liveBoundaryForPreview(volumeBotPreview());

  expect(boundary.mode).toBe("blocked-awaiting-smithii");
  expect(boundary.blockers).toContain("Smithii must confirm Volume Bot onPurchase/sellTiming/sellMode/sellStrategy mapping.");
});

it("throws if server code tries to enable live Smithii execution", () => {
  expect(() => requireServerLiveExecutionBlocked("bundle_launch")).toThrow(
    "Live Smithii execution must not run on the backend",
  );
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm test tests/unit/smithii-live-boundary.test.ts`
Expected: fail because `src/lib/smithii/live-boundary.ts` does not exist.

- [ ] **Step 3: Implement minimal boundary module**

Create discriminated types and helpers:

```ts
export type SmithiiLiveMode = "mock" | "browser-handoff-ready" | "blocked-awaiting-smithii";
export type SmithiiLiveBoundary = {
  mode: SmithiiLiveMode;
  serverExecution: "blocked";
  sdkPackage: "@smithii/sdk";
  sdkMethod: string;
  browserRequiredSignerArgs: string[];
  blockers: string[];
  questionsForSmithii: string[];
};
```

`liveBoundaryForPreview(preview)` should classify each preview kind from existing SDK spike facts. `requireServerLiveExecutionBlocked(tool)` should always throw.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm test tests/unit/smithii-live-boundary.test.ts`
Expected: pass.

### Task 2: Attach Boundary Status To Chat Results

**Files:**
- Modify: `src/lib/agent/mock-chat.ts`
- Test: `tests/unit/mock-agent.test.ts`

- [ ] **Step 1: Write failing tests**

Add expectations that preview results include `smithiiLive.mode` and execution responses remain mock or blocked:

```ts
expect(preview.smithiiLive?.mode).toBe("browser-handoff-ready");
expect(executed.smithiiLive?.mode).toBe("mock");
expect(executed.assistantMessage.text).toContain("Mock Bundle Launch executed");
```

Add a token-to-token preview assertion:

```ts
expect(result.smithiiLive?.mode).toBe("blocked-awaiting-smithii");
expect(result.smithiiLive?.blockers).toContain("@smithii/sdk/pump bundleSellBuy does not expose token-to-token swaps.");
```

- [ ] **Step 2: Verify RED**

Run: `pnpm test tests/unit/mock-agent.test.ts`
Expected: fail because `MockChatResult` has no `smithiiLive` field.

- [ ] **Step 3: Implement minimal integration**

Import `liveBoundaryForPreview` and `mockLiveBoundaryForTool`. Add `smithiiLive?: SmithiiLiveBoundary` to `MockChatResult`. Set it when a preview is prepared and set mock mode when a mock execution returns.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm test tests/unit/mock-agent.test.ts`
Expected: pass.

### Task 3: Surface Boundary State In Route/UI Types Without Live Execution

**Files:**
- Modify: `src/app/api/chat/route.ts` only if type parsing requires it
- Modify: `src/components/smithii-agent-app.tsx`
- Test: existing route and client tests

- [ ] **Step 1: Add client display only**

Show the current Phase 8 mode in the session/confirmation panel. Do not add buttons that invoke live Smithii execution.

- [ ] **Step 2: Verify route boundary remains server-only mock**

Run: `pnpm test tests/unit/chat-route.test.ts tests/unit/client-chat-state.test.ts`
Expected: pass with no private-key schema additions.

### Task 4: Update Documentation

**Files:**
- Modify: `docs/smithii-sdk-spike.md`
- Create: `docs/phase8a-live-boundary.md`

- [ ] **Step 1: Document the Phase 8A state**

Explain that bundle launch and SOL/token bundle swap are browser-handoff-ready, token-to-token swap and Volume Bot live execution remain blocked, and backend live execution is forbidden.

- [ ] **Step 2: Add Smithii questions**

List the exact remaining Smithii questions for browser tx assembly, token-to-token swap support, Volume Bot field mapping, zero-custody multi-wallet Volume Bot, idempotency, status lifecycle, and sandbox/mainnet testing.

### Task 5: Full Verification And Commit

**Files:** all changed files

- [ ] **Step 1: Run focused tests**

Run: `pnpm test tests/unit/smithii-live-boundary.test.ts tests/unit/mock-agent.test.ts tests/unit/smithii-sdk-adapter.test.ts tests/unit/chat-route.test.ts`
Expected: pass.

- [ ] **Step 2: Run full checks**

Run:

```powershell
pnpm test
pnpm lint
pnpm build
git diff --check
```

Expected: all pass. The existing Node `punycode` warning may appear during tests.

- [ ] **Step 3: Commit**

Run:

```powershell
git add -- src tests docs
git commit -m "Add phase 8A Smithii live boundary"
```

