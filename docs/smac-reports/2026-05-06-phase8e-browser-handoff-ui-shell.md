# SMAC Report: Phase 8E Browser Handoff UI Shell

Date: 2026-05-06
Branch: `feature/phase8e-browser-handoff-ui-shell`
Mode: `general`
Coverage: multi-agent research with main-thread Skeptic and verification synthesis. Six researcher roles returned usable output; the separate Skeptic spawn was blocked by agent thread limits, so Skeptic review was performed in-thread.

## Ranked Findings

### 1. Expired previews keep stale handoff UI state on the client
- Verdict: CONFIRMED
- Impact: MED
- Confidence: 0.92
- File: `src/components/smithii-agent-app.tsx:189`
- File: `src/lib/agent/client-chat-state.ts:52`
- Evidence: the client treats non-OK chat responses through `responseErrorMessage(...)`, but expired previews are returned by the route as a 410 JSON result with `executionStatus: "Preview expired"`, not an `error` string. The client therefore does not clear `pendingPlan`, `activePreview`, or `smithiiLive`, leaving a stale Phase 8E handoff shell visible for an expired plan.
- Verification: `src/app/api/chat/route.ts:245` returns status 410 when `result.executionStatus === "Preview expired"`; `tests/unit/chat-route.test.ts:1198` asserts that 410 response shape; `chatErrorStateForResponse` only handles `"Invalid pending plan."`.
- Skeptic check: normal successful chat results keep preview/live state coherent, but this is a reachable non-OK response path covered by route tests.

### 2. Handoff model does not verify preview ID matches pending plan ID
- Verdict: CONFIRMED
- Impact: MED
- Confidence: 0.9
- File: `src/lib/smithii/browser-handoff-ui.ts:31`
- File: `src/lib/smithii/browser-handoff-ui.ts:47`
- Evidence: the helper gates launch/swap only on `activePreview.kind` and `pendingPlan.tool`, then renders `pendingPlan.id`. It does not compare `activePreview.planId` to `pendingPlan.id`.
- Verification: the existing mismatch test covers mismatched tools only. `mock-chat` creates matching `pendingPlan.id` and `activePreview.planId` for bundle launch and swap, but the helper accepts separate inputs and should guard the contract it renders.
- Skeptic check: current app state normally receives both values from the same chat response; the fix is still a small contract hardening with no intended behavior loss.

### 3. Phase 8E test helper violates the exported `PendingPlan` contract
- Verdict: CONFIRMED
- Impact: LOW
- Confidence: 0.9
- File: `src/lib/agent/mock-chat.ts:40`
- File: `tests/unit/smithii-browser-handoff-ui.test.ts:105`
- Evidence: `PendingPlan` requires `createdAt: number`, while the Phase 8E test helper returns `expiresAt`.
- Verification: Vitest passes because it transpiles, but `pnpm exec tsc --noEmit` reports the target test helper error along with unrelated existing test type errors.
- Skeptic check: `pnpm test`, `pnpm lint`, and `pnpm build` are the current active gates, but a test helper should still reflect the real exported type.

### 4. Token-to-SOL handoff readiness is not directly covered in Phase 8E UI/boundary tests
- Verdict: CONFIRMED TEST GAP
- Impact: MED
- Confidence: 0.85
- File: `docs/superpowers/specs/2026-05-06-phase8e-browser-handoff-ui-shell-design.md:16`
- File: `tests/unit/smithii-browser-handoff-ui.test.ts:40`
- Evidence: Phase 8E explicitly covers SOL-to-token and token-to-SOL bundle swaps. The helper supports all non-token-to-token swaps, but focused tests only assert `sol_to_token`.
- Skeptic check: other executor/adapter tests cover token-to-SOL globally, so this is Phase 8E regression coverage rather than evidence of broken runtime behavior.

### 5. Forbidden executor import is verified manually, not encoded as a regression test
- Verdict: CONFIRMED TEST GAP
- Impact: LOW
- Confidence: 0.8
- File: `docs/superpowers/specs/2026-05-06-phase8e-browser-handoff-ui-shell-design.md:50`
- File: `docs/superpowers/plans/2026-05-06-phase8e-browser-handoff-ui-shell.md:446`
- Evidence: the phase requires no UI/backend import of `pump-browser-executor`. The current manual `rg` check passes, but no automated test preserves the invariant.
- Skeptic check: the plan accepted manual verification. A static test is low-cost and prevents accidental future wiring.

## Disagreements

- `sdkMethod` passthrough was raised as PARTIAL. Production `liveBoundaryForPreview` currently emits safe flow-specific constants, and no route/UI path accepts arbitrary boundary input from users. Deferred from cleanup backlog.
- `Generated mint keypair` wording was raised as a design choice. The Phase 8E design intentionally lists that material. Deferred.
- `PreviewRow` possible overflow was raised as LOW. No concrete failing viewport proof was produced. Deferred.
- Component-level render testing was raised as a test gap. The design intentionally moved sensitive logic to a pure helper; adding React test infrastructure is outside this cleanup.

## Design Choices

- The handoff panel remains disabled and non-executing by design.
- `browser-handoff-ready` means known browser SDK target, not backend live execution.
- The UI model is data-only and does not import/call `pump-browser-executor`.

## Dead Code

None found.

## Disputed Findings

None promoted.

## Coverage Gaps

- Separate Skeptic agent could not be spawned due to thread limits; Skeptic synthesis was performed in the main thread.
- No browser screenshot/layout test was run for the handoff panel.
- `pnpm exec tsc --noEmit` currently has unrelated existing test type errors, so it is not a clean whole-repo gate yet.

## Run Stats

- Researchers returned: 6 usable
- Verifiers: main-thread circular verification plus targeted researcher verification commands
- Findings total: 8 candidate findings
- Confirmed: 5
- Partial: 2
- Design choice: 1
- Disputed: 0
- Dead code: 0

## Confirmed Cleanup Backlog

### 1. Clear client preview/live state for expired preview responses
- Category: error-handling
- Files in scope: `src/lib/agent/client-chat-state.ts`, `src/components/smithii-agent-app.tsx`, `tests/unit/client-chat-state.test.ts`
- Recommended write owner/work package: client error-state package
- Verification: `pnpm vitest run tests/unit/client-chat-state.test.ts tests/unit/smithii-browser-handoff-ui.test.ts`
- Dependencies: none
- Safe to batch: yes, with Phase 8E helper test hardening

### 2. Require matching preview plan ID and pending plan ID in the handoff UI model
- Category: strong-types
- Files in scope: `src/lib/smithii/browser-handoff-ui.ts`, `tests/unit/smithii-browser-handoff-ui.test.ts`
- Recommended write owner/work package: browser handoff UI model package
- Verification: `pnpm vitest run tests/unit/smithii-browser-handoff-ui.test.ts`
- Dependencies: none
- Safe to batch: yes, with PendingPlan helper cleanup and token-to-SOL coverage

### 3. Align Phase 8E test helper with `PendingPlan.createdAt`
- Category: strong-types
- Files in scope: `tests/unit/smithii-browser-handoff-ui.test.ts`
- Recommended write owner/work package: browser handoff UI model package
- Verification: `pnpm vitest run tests/unit/smithii-browser-handoff-ui.test.ts`
- Dependencies: none
- Safe to batch: yes, with item 2

### 4. Add focused token-to-SOL Phase 8E coverage
- Category: strong-types
- Files in scope: `tests/unit/smithii-browser-handoff-ui.test.ts`, `tests/unit/smithii-live-boundary.test.ts`
- Recommended write owner/work package: Phase 8E supported swap variant coverage
- Verification: `pnpm vitest run tests/unit/smithii-browser-handoff-ui.test.ts tests/unit/smithii-live-boundary.test.ts`
- Dependencies: none
- Safe to batch: yes, with item 2

### 5. Encode forbidden executor import guard as a static regression test
- Category: dependency-graph
- Files in scope: `tests/unit/smithii-browser-handoff-ui.test.ts`
- Recommended write owner/work package: Phase 8E boundary regression package
- Verification: `pnpm vitest run tests/unit/smithii-browser-handoff-ui.test.ts` and `rg -n "pump-browser-executor" src/app src/components`
- Dependencies: none
- Safe to batch: yes, with item 2