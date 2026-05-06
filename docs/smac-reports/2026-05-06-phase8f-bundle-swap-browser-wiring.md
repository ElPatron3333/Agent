# SMAC Report: Phase 8F Bundle Swap Browser Wiring

Date: 2026-05-06
Branch: `feature/phase8f-bundle-swap-browser-wiring`
Mode: `general`
Coverage: single-thread fallback

## Scope

Audited Phase 8F changes only:

- `src/lib/smithii/bundle-swap-browser-wiring.ts`
- `src/lib/smithii/browser-handoff-ui.ts`
- `src/components/smithii-agent-app.tsx`
- Phase 8F unit/static tests and design/plan docs
- Import boundary from app/components/server routes to browser executor modules

Research roles simulated in the single-thread fallback:

- Security and private-key boundary reviewer
- Browser/UI state correctness reviewer
- Smithii executor contract reviewer
- Type and model contract reviewer
- Test coverage reviewer
- Dependency/layering reviewer
- Skeptic/false-positive reviewer

## Ranked Findings

No open confirmed findings remain.

### Resolved During Audit: UI Summary Omitted Sanitized Packet Identifiers

Verdict: CONFIRMED, fixed before report
Category: feature completeness / UI model display
Files: `src/components/smithii-agent-app.tsx`, `tests/unit/smithii-agent-app-browser-preparation.test.ts`
Fix commit: `13807aa Show complete Phase 8F swap packet summary`

Evidence before fix:

- `bundleSwapBrowserExecutionSummary(...)` returned `planId`, `idempotencyKey`, and `amountCount` in `src/lib/smithii/bundle-swap-browser-wiring.ts:33`-`42` and `src/lib/smithii/bundle-swap-browser-wiring.ts:143`-`156`.
- The handoff panel only displayed status/action/pool/wallets/fees in `src/components/smithii-agent-app.tsx:1200`-`1206`.
- The Phase 8F design called for the sanitized summary to include plan ID, idempotency key, amount count, expected fee, flow, action, pool, wallet count, and status.

Fix applied:

- Added panel rows for `summary.flow`, `summary.planId`, `summary.idempotencyKey`, and `summary.amountCount`.
- Added static guard expectations for those fields.

Verification after fix:

- `pnpm vitest run tests/unit/smithii-agent-app-browser-preparation.test.ts` initially failed on missing `summary.planId`.
- After the fix, targeted Phase 8F tests passed: 4 files, 31 tests.
- Full `pnpm test` passed: 18 files, 193 tests.
- `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`, and `git diff --check` passed.

## Partial / Watch Items

### 1. Fee Wallet Validation Is Enforced in the UI Caller, Not the Pure Helper

Verdict: PARTIAL / watch
Files: `src/components/smithii-agent-app.tsx:321`-`340`, `src/lib/smithii/bundle-swap-browser-wiring.ts:55`-`124`

The component blocks packet preparation when no dev/fee wallet pubkey exists before calling the helper. The helper itself accepts `feeWalletPubkey` and passes it into `createBrowserExecutionPlan(...)` without checking for an empty string.

Why this is not promoted to confirmed cleanup now:

- The only current runtime caller is `SmithiiAgentApp`, which blocks missing fee wallet state before calling the helper.
- Phase 8F did not add a backend or public API entry point for this helper.
- Adding helper-level validation is reasonable hardening in a future cleanup, but current reachable behavior is guarded.

Recommended future check:

- If another caller is added, add a helper-level blocked state for blank `feeWalletPubkey` and a unit test.

### 2. Component Wiring Test Is Static, Not a DOM Interaction Test

Verdict: DESIGN_CHOICE / coverage gap
File: `tests/unit/smithii-agent-app-browser-preparation.test.ts:1`-`19`

The repo does not currently use React Testing Library or a browser-like test environment. The Phase 8F component guard checks source wiring and forbidden imports rather than clicking the button in a rendered component.

Why this is acceptable for Phase 8F:

- The pure packet helper has behavioral coverage.
- The UI model has behavioral coverage.
- Full Next build compiles the client component.
- The static guard catches the specific import-boundary requirement that Phase 8F cares about.

Future hardening:

- Add a DOM-level test setup once the project introduces a frontend test harness.

### 3. Blocked Preparation Leaves the Prepare Button Clickable

Verdict: DESIGN_CHOICE
File: `src/components/smithii-agent-app.tsx:1152`-`1180`

After a blocked local preparation, the panel displays the blocked reason but still allows the user to click the prepare button again while the model remains a Bundle Swap handoff. This does not execute Smithii and does not send secrets.

Why this is acceptable:

- Re-clicking only re-runs local validation.
- The state scope key hides stale blocked/ready summaries after preview, plan, live-boundary, or wallet-material state changes.
- Disabling after blocked could make recovery less obvious after wallet import or plan changes.

## Disputed / False Positives

### Shared Smithii Lib Imports the Pump Browser Executor Type

Verdict: DISPUTED false positive
File: `src/lib/smithii/bundle-swap-browser-wiring.ts:9`

The helper imports `PumpBundleSwapBrowserHandoffInput` with `import type`. This does not mean app/components import `pump-browser-executor.ts`, and it does not create backend execution reachability.

Evidence:

- `rg -n "pump-browser-executor" src/app src/components` returned no matches.
- `rg -n "bundle-swap-browser-wiring|pump-browser-executor" src/app src/lib/agent src/lib/audit-log.ts` returned no matches.
- No API route was modified in Phase 8F.

## Dead Code

No dead Phase 8F code found.

## Dependency / Layering

No open dependency-graph finding found.

The intended boundary is preserved:

- `src/components/smithii-agent-app.tsx` imports the pure Bundle Swap wiring helper.
- `src/components` and `src/app` do not import `pump-browser-executor.ts`.
- Backend routes do not import the Phase 8F helper or Pump browser executor.

## Verification Evidence

Commands run after the audit fix:

- `pnpm vitest run tests/unit/smithii-bundle-swap-browser-wiring.test.ts tests/unit/smithii-pump-browser-executor.test.ts tests/unit/smithii-browser-handoff-ui.test.ts tests/unit/smithii-agent-app-browser-preparation.test.ts` -> 4 files, 31 tests passed.
- `pnpm exec tsc --noEmit` -> passed.
- `pnpm test` -> 18 files, 193 tests passed.
- `pnpm lint` -> passed.
- `pnpm build` -> passed. Note: build printed `bigint: Failed to load bindings, pure JS will be used`; this is a non-fatal dependency warning already outside Phase 8F behavior.
- `git diff --check` -> passed.
- `rg -n "pump-browser-executor" src/app src/components` -> no matches; `rg` returned exit code 1 as expected for no matches.

## Coverage Gaps

- Single-thread fallback, not true multi-agent SMAC coverage.
- No DOM interaction test for the actual click path because the repo has no frontend test harness.
- No real Smithii transaction submission tested; Phase 8F intentionally stops at local browser packet preparation.

## Confirmed Cleanup Backlog

No open confirmed cleanup backlog remains from this Phase 8F SMAC run.

The only confirmed issue found during the audit was fixed in `13807aa` and verified.

## Run Stats

- Operating mode: `general`
- Coverage: single-thread fallback
- Findings total: 4
- Confirmed open: 0
- Confirmed fixed during audit: 1
- Partial/watch: 1
- Design choices: 2
- Disputed false positives: 1
- Dead code findings: 0
- Confirmed cleanup backlog: 0
