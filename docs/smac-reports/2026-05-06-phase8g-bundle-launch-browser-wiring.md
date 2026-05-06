# SMAC Report: Phase 8G Bundle Launch Browser Wiring

Date: 2026-05-06
Branch: `feature/phase8g-bundle-launch-browser-wiring`
Mode: `general`
Coverage: single-thread fallback

## Scope

Audited Phase 8G changes only:

- `src/lib/agent/mock-chat.ts`
- `src/lib/smithii/bundle-launch-browser-wiring.ts`
- `src/lib/smithii/browser-handoff-ui.ts`
- `src/components/smithii-agent-app.tsx`
- Phase 8G unit/static tests and design/plan docs
- Import boundary from `src/app` and `src/components` to `pump-browser-executor.ts`

Research roles simulated in the single-thread fallback:

- Security and secret-boundary reviewer
- Bundle Launch SDK contract reviewer
- Browser UI state and scope reviewer
- Type/model contract reviewer
- Test coverage reviewer
- Dependency/layering reviewer
- Skeptic/false-positive reviewer

## Ranked Findings

No open confirmed findings remain.

### Resolved During Audit: Launch Preparation Scope Could Reuse Stale Image/Mint/Summary Across Same-ID Launches

Verdict: CONFIRMED, fixed before report
Category: UI state correctness / stale browser-local material
Files: `src/components/smithii-agent-app.tsx`, `tests/unit/smithii-agent-app-browser-preparation.test.ts`, `tests/unit/smithii-bundle-launch-browser-wiring.test.ts`
Fix commit: `e8b6eb1 Fix Phase 8G launch preparation scope`

Evidence before fix:

- The Phase 8G app stored selected metadata image, generated mint keypair, and sanitized launch summary by `bundleLaunchPreparationScopeKey(...)`.
- Before `e8b6eb1`, `bundleLaunchPreparationScopeKey(...)` delegated directly to the generic swap-style scope and only keyed on preview kind/plan ID, pending plan, live mode, and public wallet material.
- Bundle Launch mock plan IDs are derived from bundle wallet count, pregenerate flag, and total buy amount, not token name, symbol, description, image filename, socials, or per-buyer metadata. Two different launch previews could therefore share a plan ID and keep stale browser-local file/mint/summary state visible.
- The static app guard only checked that launch packet preparation existed; it did not require launch metadata fields in the scope.

Fix applied:

- Added launch-specific scope material in `src/components/smithii-agent-app.tsx:1540`, including `activePreview.tokenName`, `activePreview.tokenSymbol`, `activePreview.description`, `activePreview.imageFileName`, dev wallet, fee math, bundle wallet pubkeys/amounts, modifiers, and socials.
- Added static guard coverage in `tests/unit/smithii-agent-app-browser-preparation.test.ts:17` so launch scope cannot silently regress to plan ID only.
- Tightened the mint secret-material assertion in `tests/unit/smithii-bundle-launch-browser-wiring.test.ts:67` to check full secret material rather than one byte, removing a flaky audit test failure.

Verification after fix:

- `pnpm vitest run tests/unit/smithii-agent-app-browser-preparation.test.ts` initially failed because the app did not contain launch metadata scope fields.
- After the fix, focused Phase 8G/8F browser tests passed: 5 files, 43 tests.
- Full `pnpm test` passed: 19 files, 205 tests.
- `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`, and `git diff --check` passed.
- `rg -n "pump-browser-executor" src/app src/components` returned no matches.

## Partial / Watch Items

### 1. Launch File Input Is Covered by Static Guard, Not DOM Interaction

Verdict: DESIGN_CHOICE / coverage gap
Files: `src/components/smithii-agent-app.tsx:1287`, `tests/unit/smithii-agent-app-browser-preparation.test.ts:12`

The repo still has no React DOM test harness. The Phase 8G tests cover the pure helper behavior, UI model behavior, static component wiring, forbidden imports, typecheck, lint, and production build. They do not click the file input or prepare button in a rendered DOM.

Why this is not promoted to a confirmed bug:

- The helper that performs launch packet validation is behavior-tested.
- The UI model that exposes launch preparation is behavior-tested.
- The component statically imports and wires the launch preparation helper and summary renderer.
- `next build` compiles the client component successfully.

Future hardening:

- Add a DOM-level test setup once the project introduces a frontend test harness.

### 2. Local Launch Mint Keypair Is Generated Lazily on Prepare

Verdict: DESIGN_CHOICE
File: `src/components/smithii-agent-app.tsx:386`

The approved design said the browser should generate a mint keypair locally per launch scope. The implementation generates it lazily when the user prepares the local launch packet and stores it under the launch scope.

Why this is acceptable:

- No live Smithii execution or submit button exists in this phase.
- The keypair is never rendered and is passed only into the browser-local executor input.
- React lint rejected synchronous state generation inside an effect; lazy generation avoids render cascades.
- Scope-keying prevents reuse across materially different launch previews after the audit fix.

## Disputed / False Positives

### Shared Smithii Lib Imports Pump Browser Executor Types

Verdict: DISPUTED false positive
Files: `src/lib/smithii/bundle-launch-browser-wiring.ts:9`, `src/lib/smithii/bundle-swap-browser-wiring.ts:9`

The launch and swap wiring helpers import `PumpBundleLaunchBrowserHandoffInput` / `PumpBundleSwapBrowserHandoffInput` with `import type`. This does not mean app/components import `pump-browser-executor.ts`, and it does not enable backend live execution.

Evidence:

- `rg -n "pump-browser-executor" src/app src/components` returned no matches.
- No API route imports the Phase 8G launch wiring helper.
- `src/components/smithii-agent-app.tsx:391` calls the pure preparation helper, not `executePumpBundleLaunchBrowserHandoff(...)`.

## Dead Code

No dead Phase 8G code found.

## Dependency / Layering

No open dependency-graph finding found.

The intended boundary is preserved:

- `src/components/smithii-agent-app.tsx` imports the pure Bundle Launch wiring helper.
- `src/components` and `src/app` do not import `pump-browser-executor.ts`.
- Backend routes do not import the Phase 8G helper or Pump browser executor.

## Verification Evidence

Commands run after the audit fix:

- `pnpm vitest run tests/unit/smithii-bundle-launch-browser-wiring.test.ts tests/unit/smithii-bundle-swap-browser-wiring.test.ts tests/unit/smithii-pump-browser-executor.test.ts tests/unit/smithii-browser-handoff-ui.test.ts tests/unit/smithii-agent-app-browser-preparation.test.ts` -> 5 files, 43 tests passed.
- `pnpm exec tsc --noEmit` -> passed.
- `pnpm test` -> 19 files, 205 tests passed.
- `pnpm lint` -> passed.
- `pnpm build` -> passed. Note: build printed `bigint: Failed to load bindings, pure JS will be used`; this is a non-fatal dependency warning already present outside Phase 8G behavior.
- `git diff --check` -> passed.
- `rg -n "pump-browser-executor" src/app src/components` -> no matches; `rg` returned exit code 1 as expected for no matches.

## Coverage Gaps

- Single-thread fallback, not true multi-agent SMAC coverage.
- No DOM interaction test for the actual file input and prepare button because the repo has no frontend test harness.
- No real Smithii transaction submission tested; Phase 8G intentionally stops at local browser packet preparation.
- Metadata upload to Smithii remains out of scope until the final live submit phase.

## Confirmed Cleanup Backlog

No open confirmed cleanup backlog remains from this Phase 8G SMAC run.

The only confirmed issue found during the audit was fixed in `e8b6eb1` and verified. Therefore `cleanup-orchestrator` has no eligible confirmed cleanup package to execute.

## Run Stats

- Operating mode: `general`
- Coverage: single-thread fallback
- Findings total: 3
- Confirmed open: 0
- Confirmed fixed during audit: 1
- Partial/watch: 0
- Design choices / coverage gaps: 2
- Disputed false positives: 1
- Dead code findings: 0
- Confirmed cleanup backlog: 0
