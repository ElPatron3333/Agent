# Phase 8F Bundle Swap Browser Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build browser-only Bundle Swap execution packet preparation without backend live execution or UI imports of the Pump browser executor.

**Architecture:** Add a pure `bundle-swap-browser-wiring` helper that validates the current preview/plan/live-boundary/roster state and returns either a blocked reason or a prepared packet containing a non-secret browser plan plus browser-local executor input. Extend the Phase 8E UI model and app panel to expose readiness and local packet preparation only; the UI must not submit live transactions.

**Tech Stack:** TypeScript, React client component, Vitest, existing Smithii browser handoff and Pump browser executor types, `@solana/web3.js` `PublicKey` validation.

---

## File Structure

- Create `src/lib/smithii/bundle-swap-browser-wiring.ts`: pure browser-only packet preparation and sanitized summary helpers. It imports `BrowserExecutionPlan` helpers but does not call the Pump executor.
- Create `tests/unit/smithii-bundle-swap-browser-wiring.test.ts`: TDD coverage for ready, blocked, non-secret, and executor-compatible packet behavior.
- Modify `src/lib/smithii/browser-handoff-ui.ts`: add Bundle Swap preparation readiness fields to the existing UI model without exposing secrets.
- Modify `tests/unit/smithii-browser-handoff-ui.test.ts`: assert the Phase 8F UI model fields and static forbidden-import guard.
- Modify `src/components/smithii-agent-app.tsx`: add local packet-preparation state and render a Bundle Swap preparation action in the existing handoff panel.

## Task 1: Bundle Swap Browser Wiring Helper

**Files:**
- Create: `tests/unit/smithii-bundle-swap-browser-wiring.test.ts`
- Create: `src/lib/smithii/bundle-swap-browser-wiring.ts`

- [ ] **Step 1: Write failing tests for ready Bundle Swap packet preparation**

Create tests that import `prepareBundleSwapBrowserExecution`, `bundleSwapBrowserExecutionSummary`, and fixtures for a valid bundle swap preview. The ready test must assert:

```typescript
const prepared = prepareBundleSwapBrowserExecution({
  activePreview: bundleSwapPreview("sol_to_token", "11111111111111111111111111111111"),
  pendingPlan: pendingPlan("bundle_swap"),
  smithiiLive: boundary("browser-handoff-ready", "PumpFunClient.bundleSellBuy"),
  walletRoster: browserWalletRoster(),
  feeWalletPubkey: "FeeWallet111",
  nonce: "nonce-8f",
  now: new Date("2026-05-06T08:00:00.000Z"),
});

expect(prepared.status).toBe("ready");
expect(prepared.packet.plan.flow).toBe("bundle_swap");
expect(prepared.packet.executorInput.direction).toBe("sol_to_token");
expect(prepared.packet.executorInput.pool).toBe("pump");
expect(prepared.packet.executorInput.privKeys).toEqual(["SECRET_SWAP_PK_1", "SECRET_SWAP_PK_2"]);
expect(JSON.stringify(prepared.packet.plan)).not.toMatch(secretLabelPattern);
expect(JSON.stringify(bundleSwapBrowserExecutionSummary(prepared.packet))).not.toMatch(secretLabelPattern);
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm vitest run tests/unit/smithii-bundle-swap-browser-wiring.test.ts`

Expected: FAIL because `src/lib/smithii/bundle-swap-browser-wiring.ts` does not exist.

- [ ] **Step 3: Implement minimal helper**

Create `src/lib/smithii/bundle-swap-browser-wiring.ts` with:

- exported union `BundleSwapBrowserExecutionReadiness`
- exported `BundleSwapBrowserExecutionPacket`
- exported `BundleSwapBrowserExecutionSummary`
- function `prepareBundleSwapBrowserExecution(input)`
- function `bundleSwapBrowserExecutionSummary(packet)`

Implementation rules:

- Return `{ status: "blocked", reason }` for normal readiness failures.
- Require active preview kind `bundle_swap`.
- Require pending plan tool `bundle_swap` and matching `planId`.
- Require `smithiiLive.mode === "browser-handoff-ready"`.
- Reject `token_to_token`.
- Resolve mint from `toToken` for `sol_to_token`, from `fromToken` for `token_to_sol`.
- Map `pumpfun_bonding` to `pool: "pump"`; map `pumpswap_amm` to `pool: "pump-amm"`; block anything else.
- Use only `ready` preview wallets.
- Match ready wallet pubkeys to `walletRoster` entries and use their private keys only in `executorInput.privKeys`.
- Use `createBrowserExecutionPlan` with public params only.
- Expected fees lamports are `Math.round(activePreview.serviceFeeSol * 1_000_000_000).toString()`.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `pnpm vitest run tests/unit/smithii-bundle-swap-browser-wiring.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

Run:

```bash
git add src/lib/smithii/bundle-swap-browser-wiring.ts tests/unit/smithii-bundle-swap-browser-wiring.test.ts
git commit -m "Add Phase 8F bundle swap browser wiring helper"
```

## Task 2: Browser Handoff UI Model Readiness

**Files:**
- Modify: `src/lib/smithii/browser-handoff-ui.ts`
- Modify: `tests/unit/smithii-browser-handoff-ui.test.ts`

- [ ] **Step 1: Write failing UI model tests**

Add tests asserting a Bundle Swap handoff model includes non-secret preparation copy:

```typescript
expect(model?.preparation).toEqual({
  kind: "bundle_swap",
  actionLabel: "Prepare browser swap packet",
  blockedLabel: "Browser swap packet unavailable",
});
expect(JSON.stringify(model)).not.toMatch(secretLabelPattern);
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm vitest run tests/unit/smithii-browser-handoff-ui.test.ts`

Expected: FAIL because `preparation` is missing.

- [ ] **Step 3: Extend UI model minimally**

Add an optional `preparation` field to `BrowserHandoffUiModel` and populate it only for Bundle Swap browser-ready models.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `pnpm vitest run tests/unit/smithii-browser-handoff-ui.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

Run:

```bash
git add src/lib/smithii/browser-handoff-ui.ts tests/unit/smithii-browser-handoff-ui.test.ts
git commit -m "Expose Phase 8F bundle swap preparation model"
```

## Task 3: Client Packet Preparation UI

**Files:**
- Modify: `src/components/smithii-agent-app.tsx`
- Test through focused unit helpers and full build.

- [ ] **Step 1: Add local preparation state and render path**

In `SmithiiAgentApp`, add state for a sanitized Bundle Swap browser packet summary. Add a local handler that calls `prepareBundleSwapBrowserExecution(...)`, stores blocked reasons or sanitized summaries, and never stores or displays `executorInput` private keys.

- [ ] **Step 2: Update handoff panel props**

Pass a preparation callback, current status text, and disabled state into `BrowserHandoffPanel`. Render the action button as enabled only for Bundle Swap preparation readiness; it still prepares locally and does not call Smithii.

- [ ] **Step 3: Run focused checks**

Run:

```bash
pnpm vitest run tests/unit/smithii-bundle-swap-browser-wiring.test.ts tests/unit/smithii-browser-handoff-ui.test.ts tests/unit/client-chat-state.test.ts
rg -n "pump-browser-executor" src/app src/components
```

Expected: tests pass and `rg` returns no matches.

- [ ] **Step 4: Commit Task 3**

Run:

```bash
git add src/components/smithii-agent-app.tsx
git commit -m "Render Phase 8F browser swap packet preparation"
```

## Task 4: Final Phase Verification

**Files:**
- Verify entire worktree.

- [ ] **Step 1: Run targeted phase tests**

Run:

```bash
pnpm vitest run tests/unit/smithii-bundle-swap-browser-wiring.test.ts tests/unit/smithii-pump-browser-executor.test.ts tests/unit/smithii-browser-handoff-ui.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full verification**

Run:

```bash
pnpm exec tsc --noEmit
pnpm test
pnpm lint
pnpm build
git diff --check
rg -n "pump-browser-executor" src/app src/components
```

Expected: all checks pass; forbidden import search has no matches.

- [ ] **Step 3: Push branch**

Run:

```bash
git status --short --branch
git push -u origin feature/phase8f-bundle-swap-browser-wiring
```

Expected: branch is clean and pushed.