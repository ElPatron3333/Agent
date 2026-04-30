# SMAC Report: Smithii Agent Phase 4 Bundle Swap Branch

- Date: 2026-04-30
- Branch: `feature/phase4-bundle-swap`
- Commit: `c5f4b14 Add bundle swap phase four flow`
- Mode: `general`
- Target: Phase 4 Bundle Swap diff and runtime paths
- Coverage: multi-agent research and verification
- Baseline verification: `pnpm test` passed, 8 files / 62 tests

## Scope

Audited Phase 4 Bundle Swap implementation across:

- `src/lib/agent/mock-chat.ts`
- `src/app/api/chat/route.ts`
- `src/lib/smithii/mock.ts`
- `src/lib/smithii/token-routing.ts`
- `src/lib/smithii/types.ts`
- `src/lib/wallet-roster.ts`
- `src/components/smithii-agent-app.tsx`
- Phase 4 unit tests under `tests/unit`

Project constraints applied:

- Pump.fun MVP only.
- Mock-first/local-first until Smithii provides browser-side transaction assembly.
- Backend must never receive private keys.
- Preview and explicit confirmation before every execute path.

## Ranked Findings

### 1. Top-level buy intent does not enter Bundle Swap

- Impact: MED
- Confidence: 0.92
- Verification: CONFIRMED
- Score: 1.84
- Files: `src/lib/agent/mock-chat.ts:1117`, `src/lib/agent/mock-chat.ts:1347`, `tests/unit/mock-agent.test.ts:405`

`parseSwapDirection` accepts `buy` as `sol_to_token`, but top-level `isSwapIntent` only matches `sell|swap|dump`. A user starting with `buy 0.2 SOL` falls through unless a swap draft is already active.

Why it matters: Phase 4 advertises direction detection. Buy-side swap is supported by parser and prompts, but not by the initial intent gate.

Recommended fix: Add top-level buy/`sol to token` detection with a focused regression test, taking care not to hijack launch-token wording.

### 2. Buy-side wallet readiness ignores planned SOL spend

- Impact: MED
- Confidence: 0.90
- Verification: CONFIRMED
- Score: 1.80
- Files: `src/lib/smithii/mock.ts:64`, `src/lib/smithii/mock.ts:75`, `src/lib/smithii/mock.ts:109`, `src/lib/smithii/mock.ts:117`

`prepareBundleSwap` computes `plannedAmountSolOrPct`, but `swapWalletStatus` receives only direction and wallet. For `sol_to_token`, readiness only checks the fee buffer, so a wallet with `0.06 SOL` can be marked ready for a `0.5 SOL` planned buy.

Why it matters: The preview’s ready/skipped wallet count is user-facing and can overstate executable buy readiness.

Recommended fix: Pass planned amount and quantity mode into readiness logic. For SOL-spend modes, require planned SOL exposure plus fee buffer; for random mode, use max exposure.

### 3. Swap preview can silently use fewer wallets than requested

- Impact: MED
- Confidence: 0.90
- Verification: CONFIRMED
- Score: 1.80
- Files: `src/lib/agent/mock-chat.ts:880`, `src/lib/agent/mock-chat.ts:881`, `src/lib/agent/mock-chat.ts:919`, `src/lib/agent/mock-chat.ts:1285`, `src/app/api/chat/route.ts:613`

`prepareSwapPreview` slices whatever wallet selection exists and falls back to a four-wallet demo list. It does not enforce that `draft.data.walletCount` was actually satisfied. Direct route calls can also omit `swapWalletSelection`, and the route treats that as valid.

Why it matters: A request for 10 participating wallets can produce and sign a preview for fewer wallets, while the user only sees the resulting count after the fact.

Recommended fix: Require explicit, sufficient `swapWalletSelection` before signing a swap preview through the route, and make `prepareSwapPreview` reject or continue collecting when selected wallets are fewer than requested.

### 4. Imported wallets are appended after demo wallets but selection uses first N bundle rows

- Impact: MED
- Confidence: 0.90
- Verification: CONFIRMED
- Score: 1.80
- Files: `src/lib/wallet-roster.ts:123`, `src/lib/wallet-roster.ts:134`, `src/components/smithii-agent-app.tsx:944`, `src/components/smithii-agent-app.tsx:952`

Bundle Swap selection takes the first `walletCount` bundle wallets. Imported wallets are appended after existing demo bundle wallets. A user importing real browser-only keys and asking for a 1-4 wallet swap will still preview against demo wallets unless they first reset/reorder manually, and no explicit selection UI exists.

Why it matters: The preview can be technically correct for the current roster order but surprising for real imported wallet use.

Recommended fix: Make wallet selection explicit, or make import replace demo bundle rows unless the user intentionally appends.

### 5. Pending plans can be consumed by non-confirm draft requests

- Impact: MED
- Confidence: 0.88
- Verification: CONFIRMED
- Score: 1.76
- Files: `src/app/api/chat/route.ts:148`, `src/app/api/chat/route.ts:162`, `src/lib/agent/mock-chat.ts:170`, `src/lib/agent/mock-chat.ts:180`, `src/lib/agent/mock-chat.ts:190`, `src/lib/audit-log.ts:30`, `src/lib/audit-log.ts:42`, `src/lib/audit-log.ts:54`

The route claims a valid pending plan before calling `handleMockChat`. `handleMockChat` processes drafts before confirm intent. A direct API request containing a signed `pendingPlan` plus an active draft/non-confirm message can consume the stored plan without executing it and without an execution/expiry audit record.

Why it matters: This does not create unauthorized execution, but it weakens confirmation-gate integrity and audit completeness.

Recommended fix: Reject mixed `pendingPlan + draft` requests, or only claim the plan after determining the request is a confirmation attempt.

### 6. Bundle Swap route validation is looser than chat/UI validation

- Impact: MED
- Confidence: 0.88
- Verification: CONFIRMED
- Score: 1.76
- Files: `src/app/api/chat/route.ts:500`, `src/app/api/chat/route.ts:527`, `src/app/api/chat/route.ts:536`, `src/app/api/chat/route.ts:541`, `src/lib/agent/mock-chat.ts:831`, `src/lib/agent/mock-chat.ts:844`, `src/lib/agent/mock-chat.ts:1210`, `src/lib/agent/mock-chat.ts:1213`

Direct Bundle Swap drafts can bypass conversational limits. The route accepts any non-negative integer for `txCount`/`txDelayBlocks`, while chat collection caps `txCount` at 1-200 and delay at 0-100. Both route and collector accept positive random ranges without enforcing ordered ranges or percent caps.

Why it matters: Direct API callers can create signed previews with values the guided flow rejects or cannot sensibly display.

Recommended fix: Centralize or mirror Bundle Swap validation at the route boundary: `txCount` 1-200, `txDelayBlocks` 0-100, ordered min/max ranges, and percent values within 0-100.

### 7. Bundle Swap plan IDs collide across materially different plans

- Impact: MED
- Confidence: 0.88
- Verification: CONFIRMED
- Score: 1.76
- Files: `src/lib/smithii/mock.ts:70`, `src/app/api/chat/route.ts:776`, `src/app/api/chat/route.ts:641`, `tests/unit/smithii-tools.test.ts:98`

The plan ID uses only direction and participating wallet count. It omits token pair, routing, quantity mode, tx count, delay, overrides, and balances. Since plan records are keyed by session and plan ID, two same-direction/same-count previews in one session collide at persistence.

Why it matters: A later preview can overwrite an earlier pending record path, confusing confirmation handles and audit signatures.

Recommended fix: Use an opaque unique ID or include a stable hash of the normalized preview input. Add a collision regression test.

### 8. `token_to_token` path is exposed but untested

- Impact: MED
- Confidence: 0.80
- Verification: CONFIRMED
- Score: 1.60
- Files: `src/lib/agent/mock-chat.ts:1125`, `src/lib/smithii/types.ts:47`, `src/app/api/chat/route.ts:447`

`token_to_token` appears in user-facing direction parsing, shared types, and route validation, but no unit test drives it through mock-agent, route, or Smithii mock preview behavior.

Why it matters: It is a documented Phase 4 direction, and it has different token-balance/routing expectations than `sol_to_token`.

Recommended fix: Add one `prepareBundleSwap` test and one mock-agent/route test for `token_to_token`, including zero-token wallet skip behavior and routing visibility.

### 9. Generic swap messages send a public roster before wallet count is chosen

- Impact: LOW
- Confidence: 0.86
- Verification: CONFIRMED
- Score: 0.86
- Files: `src/components/smithii-agent-app.tsx:143`, `src/components/smithii-agent-app.tsx:899`, `src/components/smithii-agent-app.tsx:904`

For any no-draft message matching `sell|swap|dump`, the client builds a three-wallet public selection before the agent has asked for direction or wallet count. Private keys are still protected, but pubkeys/balances are sent earlier than necessary and can pre-fail small rosters before a clarifying question.

Why it matters: This is a boundary-minimization issue, not a key leak.

Recommended fix: Only send swap selections when a swap draft has `walletCount`, or when a complete one-shot intent has enough parsed information to justify roster submission.

### 10. Swap preview table omits per-row amount units

- Impact: LOW
- Confidence: 0.92
- Verification: CONFIRMED
- Score: 0.92
- Files: `src/components/smithii-agent-app.tsx:721`, `src/components/smithii-agent-app.tsx:674`

The per-wallet Plan cell renders a bare `plannedAmountSolOrPct` number. Depending on quantity mode, the value can mean SOL or percent. The higher-level Quantity row has units, but the table itself loses context.

Why it matters: Users scanning wallet readiness can misread `80` or `0.5`.

Recommended fix: Derive row units from quantity mode and render `0.5 SOL` or `80%`.

## Design Choices

### Mock routing uses token-label heuristics

- Files: `src/lib/smithii/token-routing.ts:3`, `src/lib/smithii/token-routing.ts:10`, `PLAN.md:353`
- Verdict: DESIGN_CHOICE

The routing helper is explicitly named `resolveMockBundleSwapRouting` and is intentionally local-first. It should not be treated as a Phase 4 defect unless the branch claims live RPC token-state detection. Before real execution, this must become an explicit token-state adapter backed by RPC/Helius or Smithii-provided state.

### Local file-backed pending plans and audit logs

- Files: `src/app/api/chat/route.ts:63`, `src/app/api/chat/route.ts:68`, `src/lib/audit-log.ts:15`
- Verdict: DESIGN_CHOICE

Local persistence remains acceptable in the mock-first branch. It should not be promoted to production/live execution without session/user-bound server storage.

### Mock signatures and deterministic demo defaults

- Files: `src/lib/smithii/mock.ts:158`, `src/lib/agent/mock-chat.ts:1024`, `src/lib/agent/mock-chat.ts:1036`
- Verdict: DESIGN_CHOICE

Mock execution and demo defaults are consistent with the current phase, as long as the UI continues to label execution as mock and confirmation is required.

## Disagreements

No verifier disputed a confirmed finding. The main classification disagreement was routing: a researcher marked string-based routing high impact, but the verifier and Skeptic classified it as a deliberate mock-phase design choice.

## Dead Code

No dead code findings were confirmed.

## Disputed Findings

None.

## Coverage Gaps

- No browser-level UI test confirms payload shape from `SmithiiAgentApp`.
- No `token_to_token` coverage exists despite exposed route/type/parser support.
- No route-boundary tests cover invalid Bundle Swap numeric limits.
- No test proves two different Bundle Swap previews produce distinct plan IDs.
- No test covers pending plan plus active draft mixed requests.

## Confirmed Cleanup Backlog

### 1. Fix pending-plan claim ordering for confirmation-only consumption

- Category: error-handling
- Files in scope:
  - `src/app/api/chat/route.ts`
  - `src/lib/agent/mock-chat.ts`
  - `src/lib/audit-log.ts`
  - `tests/unit/chat-route.test.ts`
- Recommended owner/work package: route boundary and confirmation gate
- Verification: `pnpm test tests/unit/chat-route.test.ts`
- Dependencies: none
- Safe to batch: yes, with route validation tests

### 2. Align Bundle Swap route validation with chat validation

- Category: strong-types
- Files in scope:
  - `src/app/api/chat/route.ts`
  - `src/lib/agent/mock-chat.ts`
  - `tests/unit/chat-route.test.ts`
  - `tests/unit/mock-agent.test.ts`
- Recommended owner/work package: shared Bundle Swap validation
- Verification: `pnpm test tests/unit/chat-route.test.ts tests/unit/mock-agent.test.ts`
- Dependencies: none
- Safe to batch: yes, with quantity-range fixes

### 3. Enforce requested swap wallet count before signing previews

- Category: error-handling
- Files in scope:
  - `src/app/api/chat/route.ts`
  - `src/lib/agent/mock-chat.ts`
  - `src/components/smithii-agent-app.tsx`
  - `tests/unit/chat-route.test.ts`
  - `tests/unit/mock-agent.test.ts`
- Recommended owner/work package: swap wallet selection boundary
- Verification: `pnpm test tests/unit/chat-route.test.ts tests/unit/mock-agent.test.ts`
- Dependencies: may share helpers with validation cleanup
- Safe to batch: yes

### 4. Include planned SOL exposure in buy-side wallet readiness

- Category: strong-types
- Files in scope:
  - `src/lib/smithii/mock.ts`
  - `tests/unit/smithii-tools.test.ts`
- Recommended owner/work package: Smithii mock preview math
- Verification: `pnpm test tests/unit/smithii-tools.test.ts`
- Dependencies: none
- Safe to batch: yes

### 5. Make Bundle Swap plan IDs collision-resistant

- Category: strong-types
- Files in scope:
  - `src/lib/smithii/mock.ts`
  - `tests/unit/smithii-tools.test.ts`
  - `tests/unit/chat-route.test.ts`
- Recommended owner/work package: pending plan identity
- Verification: `pnpm test tests/unit/smithii-tools.test.ts tests/unit/chat-route.test.ts`
- Dependencies: none
- Safe to batch: yes

### 6. Add top-level buy intent support

- Category: error-handling
- Files in scope:
  - `src/lib/agent/mock-chat.ts`
  - `src/components/smithii-agent-app.tsx`
  - `tests/unit/mock-agent.test.ts`
- Recommended owner/work package: swap intent parsing
- Verification: `pnpm test tests/unit/mock-agent.test.ts`
- Dependencies: none
- Safe to batch: yes

### 7. Add `token_to_token` regression coverage

- Category: strong-types
- Files in scope:
  - `tests/unit/mock-agent.test.ts`
  - `tests/unit/smithii-tools.test.ts`
  - optionally `tests/unit/chat-route.test.ts`
- Recommended owner/work package: Phase 4 direction coverage
- Verification: `pnpm test tests/unit/mock-agent.test.ts tests/unit/smithii-tools.test.ts`
- Dependencies: none
- Safe to batch: yes

## Run Stats

- Researchers dispatched: 5
- Skeptic roles dispatched: 1
- Usable researcher reports: 5
- Usable Skeptic reports: 1
- Verifiers dispatched: 4
- Usable verifier reports: 4
- Raw researcher findings: 15
- Confirmed ranked findings after merge: 10
- Confirmed cleanup backlog items: 7
- Design choices: 3
- Disputed findings: 0
- Dead code findings: 0
- Rubber-stamp verifier concern: none detected

## Terminal Summary

```text
SMAC complete - 10 findings (10 confirmed, 0 partial, 0 disputed)
Full report: docs/smac-reports/2026-04-30-smithii-agent-phase4-bundle-swap-smac.md

Top 5:
  1. [MED/92%] Top-level buy intent does not enter Bundle Swap
  2. [MED/90%] Buy-side wallet readiness ignores planned SOL spend
  3. [MED/90%] Swap preview can silently use fewer wallets than requested
  4. [MED/90%] Imported wallets are appended after demo wallets but selection uses first N bundle rows
  5. [MED/88%] Pending plans can be consumed by non-confirm draft requests

Next step: use cleanup-orchestrator on the confirmed cleanup backlog, or run a narrower follow-up audit on the top finding.
```
