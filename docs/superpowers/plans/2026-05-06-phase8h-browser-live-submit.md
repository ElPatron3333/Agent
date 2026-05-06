# Phase 8H Browser Live Submit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add guarded browser-side live submit for prepared Bundle Launch and Bundle Swap packets using Smithii's Pump browser SDK path.

**Architecture:** Add a small injected Solana wallet provider adapter, then add a browser live-submit helper that validates signer/config/approval and dispatches to the existing Pump browser executor. Wire the app to connect a browser wallet, require explicit live approval, re-prepare the current scoped packet on submit, and render only sanitized submit status.

**Tech Stack:** TypeScript, React client component, Vitest, `@solana/web3.js`, `@smithii/sdk/pump`, existing Smithii browser handoff and Pump browser executor modules.

---

## File Structure

- Create `src/lib/solana/browser-wallet-signer.ts`: injected Phantom/Solflare-style provider detection, connection, and signer normalization.
- Create `tests/unit/solana-browser-wallet-signer.test.ts`: TDD coverage for provider connection and blocked states.
- Create `src/lib/smithii/browser-live-submit.ts`: readiness and submit helper for Bundle Launch and Bundle Swap packets.
- Create `tests/unit/smithii-browser-live-submit.test.ts`: TDD coverage for readiness, launch submit, swap submit, and secret redaction.
- Modify `src/components/smithii-agent-app.tsx`: connect browser wallet, show approval + submit controls, re-prepare packet on submit, and render sanitized submit status.
- Modify `tests/unit/smithii-agent-app-browser-preparation.test.ts`: static guards for Phase 8H submit wiring and forbidden direct executor imports.

## Task 1: Browser Wallet Signer Adapter

**Files:**
- Create: `tests/unit/solana-browser-wallet-signer.test.ts`
- Create: `src/lib/solana/browser-wallet-signer.ts`

- [ ] **Step 1: Write failing tests for injected wallet signer connection**

Create tests that assert:

```typescript
const provider = browserProvider({ publicKey: "Wallet111" });
const connected = await connectInjectedSolanaWallet(provider);
expect(connected.status).toBe("connected");
expect(connected.signer.publicKey.toBase58()).toBe("Wallet111");
await expect(connected.signer.signTransaction("tx")).resolves.toBe("signed:tx");
await expect(connected.signer.signAllTransactions(["a", "b"])).resolves.toEqual(["signed:a", "signed:b"]);
```

Also test blocked states for missing provider, provider connect rejection, missing public key, missing `signTransaction`, and missing `signAllTransactions`.

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run tests/unit/solana-browser-wallet-signer.test.ts`

Expected: FAIL because `src/lib/solana/browser-wallet-signer.ts` does not exist.

- [ ] **Step 3: Implement minimal adapter**

Create `src/lib/solana/browser-wallet-signer.ts` exporting:

- `InjectedSolanaProvider`
- `BrowserWalletSigner`
- `BrowserWalletConnectionResult`
- `injectedSolanaProviderFromWindow(windowLike)`
- `connectInjectedSolanaWallet(provider)`

Rules:

- Prefer `window.solana` when present, otherwise `window.solflare`.
- Return `{ status: "blocked", reason }` for normal readiness failures.
- Normalize string public keys to `{ toBase58: () => value }`.
- Preserve provider signing methods by delegating to the provider.

- [ ] **Step 4: Run GREEN**

Run: `pnpm vitest run tests/unit/solana-browser-wallet-signer.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/lib/solana/browser-wallet-signer.ts tests/unit/solana-browser-wallet-signer.test.ts
git commit -m "Add browser wallet signer adapter"
```

## Task 2: Smithii Browser Live Submit Helper

**Files:**
- Create: `tests/unit/smithii-browser-live-submit.test.ts`
- Create: `src/lib/smithii/browser-live-submit.ts`

- [ ] **Step 1: Write failing live-submit tests**

Tests must cover:

- Missing packet blocks with `Browser packet must be prepared before live submit.`
- Missing signer blocks with `Connected browser wallet signer is required.`
- Missing approval blocks with `Explicit live submit approval is required.`
- Missing runtime config blocks with the existing config validation message.
- Bundle Launch executes through injected mock client and returns sanitized launch result.
- Bundle Swap executes through injected mock client and returns sanitized swap result.
- JSON of submit result/error does not contain private key values or private-key-shaped labels.

Use an injected `clientFactory` in tests so no real network or Smithii call happens.

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run tests/unit/smithii-browser-live-submit.test.ts`

Expected: FAIL because `src/lib/smithii/browser-live-submit.ts` does not exist.

- [ ] **Step 3: Implement minimal submit helper**

Create `src/lib/smithii/browser-live-submit.ts` exporting:

- `BrowserLiveSubmitPacket`
- `BrowserLiveSubmitResult`
- `BrowserLiveSubmitInput`
- `browserLiveSubmitReadiness(input)`
- `executeBrowserLiveSubmit(input)`

Rules:

- Accept packet kinds `bundle_launch` and `bundle_swap`.
- Validate packet, signer, approval, and public runtime config before creating a client.
- Use `pumpBrowserHandoffConfigFromEnv(...)` and `createPumpBrowserClient(...)` by default.
- Allow tests to inject `clientFactory`.
- Dispatch to `executePumpBundleLaunchBrowserHandoff(...)` or `executePumpBundleSwapBrowserHandoff(...)`.
- Catch executor errors through `normalizePumpBrowserExecutionError(...)` and return `{ status: "failed", error }`.

- [ ] **Step 4: Run GREEN**

Run: `pnpm vitest run tests/unit/smithii-browser-live-submit.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/lib/smithii/browser-live-submit.ts tests/unit/smithii-browser-live-submit.test.ts
git commit -m "Add Smithii browser live submit helper"
```

## Task 3: App Live Submit Wiring

**Files:**
- Modify: `src/components/smithii-agent-app.tsx`
- Modify: `tests/unit/smithii-agent-app-browser-preparation.test.ts`

- [ ] **Step 1: Write failing static app guards**

Add expectations that the app source contains:

```typescript
expect(appSource).toContain("connectInjectedSolanaWallet");
expect(appSource).toContain("injectedSolanaProviderFromWindow");
expect(appSource).toContain("executeBrowserLiveSubmit");
expect(appSource).toContain("Explicit live submit approval");
expect(appSource).toContain("Submit live launch via Smithii");
expect(appSource).toContain("Submit live swap via Smithii");
expect(appSource).toContain("submitResult.result");
expect(appSource).not.toContain("pump-browser-executor");
```

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run tests/unit/smithii-agent-app-browser-preparation.test.ts`

Expected: FAIL because app live submit wiring is missing.

- [ ] **Step 3: Implement app state and handlers**

In `SmithiiAgentApp`:

- Add browser wallet connection state.
- Replace inert `Connect Wallet` button with `connectBrowserWallet` handler using `injectedSolanaProviderFromWindow(window)` and `connectInjectedSolanaWallet(...)`.
- Add live-submit approval state scoped to the same browser preparation scope.
- Add submit result state scoped to the same browser preparation scope.
- Add `submitPreparedBrowserPacket()` that re-runs the appropriate preparation helper, then calls `executeBrowserLiveSubmit(...)` with `process.env.NEXT_PUBLIC_*` config and the connected signer.

- [ ] **Step 4: Extend handoff panel**

Pass live-submit props into `BrowserHandoffPanel` and render:

- browser wallet status
- approval checkbox
- submit button
- blocked/pending/submitted/failed status
- sanitized result rows

- [ ] **Step 5: Run focused checks**

Run:

```bash
pnpm vitest run tests/unit/solana-browser-wallet-signer.test.ts tests/unit/smithii-browser-live-submit.test.ts tests/unit/smithii-agent-app-browser-preparation.test.ts
pnpm exec tsc --noEmit
pnpm lint
rg -n "pump-browser-executor" src/app src/components
```

Expected: tests/typecheck/lint pass and forbidden import search has no matches.

- [ ] **Step 6: Commit Task 3**

```bash
git add src/components/smithii-agent-app.tsx tests/unit/smithii-agent-app-browser-preparation.test.ts
git commit -m "Wire browser live submit controls"
```

## Task 4: Final Phase Verification and Push

**Files:**
- Verify entire worktree.

- [ ] **Step 1: Run targeted phase tests**

Run:

```bash
pnpm vitest run tests/unit/solana-browser-wallet-signer.test.ts tests/unit/smithii-browser-live-submit.test.ts tests/unit/smithii-bundle-launch-browser-wiring.test.ts tests/unit/smithii-bundle-swap-browser-wiring.test.ts tests/unit/smithii-pump-browser-executor.test.ts tests/unit/smithii-agent-app-browser-preparation.test.ts
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
git push -u origin feature/phase8h-browser-live-submit
```

Expected: branch is clean and pushed.

## Task 5: Phase 8H SMAC and Cleanup Gate

**Files:**
- Create: `docs/smac-reports/2026-05-06-phase8h-browser-live-submit.md`
- Modify only if SMAC produces confirmed cleanup backlog.

- [ ] **Step 1: Run one focused Phase 8H SMAC**

Audit Phase 8H browser wallet signer, live-submit helper, UI wiring, tests, and import boundaries.

- [ ] **Step 2: Run cleanup-orchestrator only if the SMAC report has confirmed cleanup backlog**

If the report has no eligible confirmed cleanup backlog, record the no-op cleanup gate and do not run speculative cleanup.

- [ ] **Step 3: Verify cleanup changes if any**

Run targeted tests plus `pnpm exec tsc --noEmit`, `pnpm lint`, and `git diff --check` after any cleanup change.
