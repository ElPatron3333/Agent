# Phase 8G Bundle Launch Browser Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build browser-only Bundle Launch execution packet preparation without backend live execution, real Smithii submission, metadata upload, or UI imports of the Pump browser executor.

**Architecture:** Add structured non-secret Bundle Launch preview metadata, then add a pure `bundle-launch-browser-wiring` helper that validates preview/plan/live-boundary/roster/file/mint-keypair state and returns either a blocked reason or a local packet. The packet contains a non-secret browser execution plan plus browser-local executor input. Extend the browser handoff UI model and app panel to prepare and render only sanitized launch packet summaries.

**Tech Stack:** TypeScript, React client component, Vitest, existing Smithii browser handoff and Pump browser executor types, `@solana/web3.js` `Keypair`.

---

## File Structure

- Modify `src/lib/agent/types.ts` and preview construction paths as needed: add structured Bundle Launch preview fields `tokenName`, `tokenSymbol`, and `description` while keeping `token` display text.
- Create `tests/unit/smithii-bundle-launch-browser-wiring.test.ts`: TDD coverage for ready, blocked, non-secret, and executor-compatible launch packet behavior.
- Create `src/lib/smithii/bundle-launch-browser-wiring.ts`: pure browser-only packet preparation and sanitized summary helpers.
- Modify `src/lib/smithii/browser-handoff-ui.ts`: add Bundle Launch preparation readiness fields to the existing UI model without exposing secrets.
- Modify `tests/unit/smithii-browser-handoff-ui.test.ts`: assert Bundle Launch preparation copy and preserve Bundle Swap behavior.
- Modify `src/components/smithii-agent-app.tsx`: add browser-local metadata file and mint keypair state, prepare launch packets locally, and render sanitized summaries only.
- Modify `tests/unit/smithii-agent-app-browser-preparation.test.ts`: static guards for launch wiring and forbidden executor imports.

## Task 1: Structured Bundle Launch Preview Metadata

**Files:**
- Modify: `src/lib/agent/types.ts`
- Modify: Bundle Launch preview construction paths and affected tests

- [ ] **Step 1: Write failing tests for structured launch metadata**

Add or update tests that assert Bundle Launch previews expose:

```typescript
expect(preview.kind).toBe("bundle_launch");
expect(preview.tokenName).toBe("Blue Frog");
expect(preview.tokenSymbol).toBe("BFROG");
expect(preview.description).toContain("launch");
expect(preview.token).toBe("Blue Frog / BFROG");
```

- [ ] **Step 2: Run tests and verify RED**

Run the narrowest affected test command. Expected: FAIL because structured launch metadata fields are not present everywhere they are required.

- [ ] **Step 3: Implement minimal preview shape update**

Add `tokenName`, `tokenSymbol`, and `description` to the Bundle Launch preview type and construction paths. Keep the existing `token` display field unchanged for current UI compatibility.

- [ ] **Step 4: Run tests and verify GREEN**

Run the same focused test command. Expected: PASS.

- [ ] **Step 5: Commit Task 1**

Commit only the preview metadata change and its tests.

## Task 2: Bundle Launch Browser Wiring Helper

**Files:**
- Create: `tests/unit/smithii-bundle-launch-browser-wiring.test.ts`
- Create: `src/lib/smithii/bundle-launch-browser-wiring.ts`

- [ ] **Step 1: Write failing tests for ready Bundle Launch packet preparation**

Create tests that import `prepareBundleLaunchBrowserExecution` and `bundleLaunchBrowserExecutionSummary`. The ready test must assert:

```typescript
const prepared = prepareBundleLaunchBrowserExecution({
  activePreview: bundleLaunchPreview(),
  pendingPlan: pendingPlan("bundle_launch"),
  smithiiLive: boundary("browser-handoff-ready", "PumpFunClient.createAndSnipe"),
  walletRoster: browserWalletRoster(),
  metadataFile,
  mintKeypair,
  nonce: "nonce-8g",
  now: new Date("2026-05-06T09:00:00.000Z"),
});

expect(prepared.status).toBe("ready");
expect(prepared.packet.plan.flow).toBe("bundle_launch");
expect(prepared.packet.executorInput.metadata.file).toBe(metadataFile);
expect(prepared.packet.executorInput.mintKeypair).toBe(mintKeypair);
expect(prepared.packet.executorInput.buyers).toEqual([
  { pk: "SECRET_BUYER_PK_1", amount: 0.2 },
  { pk: "SECRET_BUYER_PK_2", amount: 0.3 },
]);
expect(JSON.stringify(prepared.packet.plan)).not.toMatch(secretLabelPattern);
expect(JSON.stringify(bundleLaunchBrowserExecutionSummary(prepared.packet))).not.toMatch(secretLabelPattern);
```

Also assert that the summary does not contain the metadata description body, image bytes, or mint keypair secret material.

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm vitest run tests/unit/smithii-bundle-launch-browser-wiring.test.ts`

Expected: FAIL because `src/lib/smithii/bundle-launch-browser-wiring.ts` does not exist.

- [ ] **Step 3: Implement minimal helper**

Create `src/lib/smithii/bundle-launch-browser-wiring.ts` with:

- exported union `BundleLaunchBrowserExecutionReadiness`
- exported `BundleLaunchBrowserExecutionPacket`
- exported `BundleLaunchBrowserExecutionSummary`
- function `prepareBundleLaunchBrowserExecution(input)`
- function `bundleLaunchBrowserExecutionSummary(packet)`

Implementation rules:

- Return `{ status: "blocked", reason }` for normal readiness failures.
- Require active preview kind `bundle_launch`.
- Require pending plan tool `bundle_launch` and matching `planId`.
- Require `smithiiLive.mode === "browser-handoff-ready"`.
- Require `metadataFile` and `mintKeypair`.
- Require dev wallet and all buyer wallets to have browser-local private-key material in `walletRoster`.
- Require at least one bundle buyer wallet.
- Map metadata name, symbol, description, file, filename, and socials from preview/file state.
- Map `devAmount` from `preview.devWalletFeesSol - preview.serviceFeeSol - pregenerateFeeSol`, clamped to `0`.
- Map buyers from preview bundle wallets and matching roster private keys.
- Map `isCashbackCoin` and `isTokenPregenerated` from preview modifiers.
- Use `createBrowserExecutionPlan` with public params only.
- Expected fees lamports are `Math.round(activePreview.devWalletFeesSol * 1_000_000_000).toString()`.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `pnpm vitest run tests/unit/smithii-bundle-launch-browser-wiring.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

Commit only the launch wiring helper and its tests.

## Task 3: Browser Handoff UI Model for Launch Preparation

**Files:**
- Modify: `src/lib/smithii/browser-handoff-ui.ts`
- Modify: `tests/unit/smithii-browser-handoff-ui.test.ts`

- [ ] **Step 1: Write failing UI model tests**

Add tests asserting a Bundle Launch handoff model includes non-secret preparation copy:

```typescript
expect(model?.preparation).toEqual({
  kind: "bundle_launch",
  actionLabel: "Prepare browser launch packet",
  blockedLabel: "Browser launch packet unavailable",
});
expect(JSON.stringify(model)).not.toMatch(secretLabelPattern);
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm vitest run tests/unit/smithii-browser-handoff-ui.test.ts`

Expected: FAIL because Bundle Launch preparation copy is missing.

- [ ] **Step 3: Extend UI model minimally**

Populate `preparation` for Bundle Launch browser-ready models while preserving the existing Bundle Swap preparation model.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `pnpm vitest run tests/unit/smithii-browser-handoff-ui.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

Commit only the UI model update and tests.

## Task 4: Client Launch Packet Preparation UI

**Files:**
- Modify: `src/components/smithii-agent-app.tsx`
- Modify: `tests/unit/smithii-agent-app-browser-preparation.test.ts`

- [ ] **Step 1: Write failing static/client preparation tests**

Update static app tests to assert:

- `SmithiiAgentApp` imports `prepareBundleLaunchBrowserExecution` and `bundleLaunchBrowserExecutionSummary`.
- `SmithiiAgentApp` imports `Keypair` from `@solana/web3.js`.
- The app has a Bundle Launch metadata file input.
- The app renders launch summary labels for mint public key, dev amount, buyer count, expected fees, pregenerate, cashback, plan ID, and idempotency key.
- `src/app` and `src/components` do not import `pump-browser-executor.ts`.

Run: `pnpm vitest run tests/unit/smithii-agent-app-browser-preparation.test.ts`

Expected: FAIL because launch preparation UI wiring is missing.

- [ ] **Step 2: Implement local launch preparation state**

In `SmithiiAgentApp`, add browser-local state for:

- selected Bundle Launch metadata image file
- generated mint keypair scoped to the active launch preview/plan
- sanitized launch preparation summary

Do not store or render the full executor input.

- [ ] **Step 3: Render launch preparation controls and summary**

Extend the existing handoff panel to:

- show the metadata image file input only for Bundle Launch preparation readiness
- generate a mint keypair locally when the launch scope changes and preparation is possible
- call `prepareBundleLaunchBrowserExecution(...)` on button click
- display only the sanitized summary
- preserve Phase 8F Bundle Swap behavior

- [ ] **Step 4: Run focused checks and verify GREEN**

Run:

```bash
pnpm vitest run tests/unit/smithii-bundle-launch-browser-wiring.test.ts tests/unit/smithii-bundle-swap-browser-wiring.test.ts tests/unit/smithii-pump-browser-executor.test.ts tests/unit/smithii-browser-handoff-ui.test.ts tests/unit/smithii-agent-app-browser-preparation.test.ts
rg -n "pump-browser-executor" src/app src/components
```

Expected: tests pass and forbidden import search has no matches.

- [ ] **Step 5: Commit Task 4**

Commit only the app wiring and tests.

## Task 5: Final Phase Verification and Push

**Files:**
- Verify entire worktree.

- [ ] **Step 1: Run targeted phase tests**

Run:

```bash
pnpm vitest run tests/unit/smithii-bundle-launch-browser-wiring.test.ts tests/unit/smithii-bundle-swap-browser-wiring.test.ts tests/unit/smithii-pump-browser-executor.test.ts tests/unit/smithii-browser-handoff-ui.test.ts tests/unit/smithii-agent-app-browser-preparation.test.ts
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
git push -u origin feature/phase8g-bundle-launch-browser-wiring
```

Expected: branch is clean and pushed.

## Task 6: Post-implementation SMAC and Cleanup Gate

**Files:**
- Create: `docs/smac-reports/2026-05-06-phase8g-bundle-launch-browser-wiring.md`
- Modify only if SMAC produces confirmed cleanup backlog.

- [ ] **Step 1: Run one focused Phase 8G SMAC**

Audit the Phase 8G branch after implementation. Scope the audit to Bundle Launch browser wiring, UI preparation, tests, and import boundaries.

- [ ] **Step 2: Run cleanup-orchestrator only if the SMAC report has confirmed cleanup backlog**

If the report has no eligible confirmed cleanup backlog, record the no-op cleanup gate and do not run speculative cleanup.

- [ ] **Step 3: Verify cleanup changes if any**

Run the relevant targeted tests plus `pnpm exec tsc --noEmit` and `git diff --check` after any cleanup change.
