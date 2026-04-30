# SMAC Report: Smithii Agent Phase 4 Cleanup Follow-up

- Date: 2026-04-30
- Branch: `feature/phase4-bundle-swap`
- Commit: `b5ff6f1 Fix phase 4 SMAC findings`
- Mode: `cleanup`
- Target: Closure audit for `2026-04-30-smithii-agent-phase4-bundle-swap-smac.md`
- Coverage: single-thread fallback, targeted closure verification

## Scope

This follow-up checked whether the confirmed Phase 4 SMAC findings were closed after cleanup commit `b5ff6f1`.

Files reviewed:

- `src/lib/agent/mock-chat.ts`
- `src/app/api/chat/route.ts`
- `src/lib/smithii/mock.ts`
- `src/lib/wallet-roster.ts`
- `src/components/smithii-agent-app.tsx`
- `tests/unit/mock-agent.test.ts`
- `tests/unit/chat-route.test.ts`
- `tests/unit/smithii-tools.test.ts`
- `tests/unit/wallet-roster.test.ts`

Verification commands:

- `pnpm test tests/unit/mock-agent.test.ts tests/unit/chat-route.test.ts tests/unit/smithii-tools.test.ts tests/unit/wallet-roster.test.ts` -> passed, 59 tests
- `pnpm test` -> passed, 73 tests
- `pnpm lint` -> passed
- `pnpm build` -> passed

## Ranked Findings

No open confirmed cleanup findings remain from the prior Phase 4 SMAC backlog.

## Prior Finding Closure

### 1. Top-level buy intent does not enter Bundle Swap

- Prior verdict: CONFIRMED
- Follow-up verdict: CLOSED
- Evidence:
  - `src/lib/agent/mock-chat.ts:1361` now includes `buy` in `isSwapIntent`.
  - `src/lib/agent/mock-chat.ts:1037` infers `fromToken: "SOL"` for `sol_to_token`.
  - `tests/unit/mock-agent.test.ts:427` covers top-level `buy 0.2 SOL with 3 wallets`.

### 2. Buy-side wallet readiness ignores planned SOL spend

- Prior verdict: CONFIRMED
- Follow-up verdict: CLOSED
- Evidence:
  - `src/lib/smithii/mock.ts:68` computes planned SOL exposure.
  - `src/lib/smithii/mock.ts:140` requires planned exposure plus fee buffer for `sol_to_token`.
  - `tests/unit/smithii-tools.test.ts:175` covers insufficient planned buy SOL.

### 3. Swap preview can silently use fewer wallets than requested

- Prior verdict: CONFIRMED
- Follow-up verdict: CLOSED
- Evidence:
  - `src/lib/agent/mock-chat.ts:883` blocks preview creation when selected/fallback wallets are fewer than requested.
  - `src/app/api/chat/route.ts:642` rejects complete swap drafts without a public selection.
  - `tests/unit/mock-agent.test.ts:451` and `tests/unit/chat-route.test.ts:414` cover both paths.

### 4. Imported wallets are appended after demo wallets but selection uses first N bundle rows

- Prior verdict: CONFIRMED
- Follow-up verdict: CLOSED
- Evidence:
  - `src/lib/wallet-roster.ts:108` and `src/lib/wallet-roster.ts:137` sort bundle selections by selection priority.
  - `src/lib/wallet-roster.ts:204` gives imported wallets priority.
  - `tests/unit/wallet-roster.test.ts:201` verifies imported wallets are selected before demo bundle wallets.

### 5. Pending plans can be consumed by non-confirm draft requests

- Prior verdict: CONFIRMED
- Follow-up verdict: CLOSED
- Evidence:
  - `src/app/api/chat/route.ts:148` claims plan records only for confirm-like messages.
  - `src/app/api/chat/route.ts:653` defines the route-level confirm parser.
  - `tests/unit/chat-route.test.ts:467` verifies a non-confirm draft request does not consume the pending plan.

### 6. Bundle Swap route validation is looser than chat/UI validation

- Prior verdict: CONFIRMED
- Follow-up verdict: CLOSED
- Evidence:
  - `src/app/api/chat/route.ts:500` enforces `txCount` 1-200.
  - `src/app/api/chat/route.ts:512` enforces `txDelayBlocks` 0-100.
  - `src/app/api/chat/route.ts:547` and `src/app/api/chat/route.ts:554` enforce ordered random ranges and percent max <= 100.
  - `src/lib/agent/mock-chat.ts:1218` and `src/lib/agent/mock-chat.ts:1224` enforce the same range semantics in the collector.
  - `tests/unit/chat-route.test.ts:431` and `tests/unit/mock-agent.test.ts:465` cover invalid values.

### 7. Bundle Swap plan IDs collide across materially different plans

- Prior verdict: CONFIRMED
- Follow-up verdict: CLOSED
- Evidence:
  - `src/lib/smithii/mock.ts:78` appends a stable plan hash to Bundle Swap plan IDs.
  - `src/lib/smithii/mock.ts:152` hashes the normalized material plan input.
  - `tests/unit/smithii-tools.test.ts:196` verifies distinct plan IDs for materially different swaps.

### 8. `token_to_token` path is exposed but untested

- Prior verdict: CONFIRMED
- Follow-up verdict: CLOSED
- Evidence:
  - `tests/unit/mock-agent.test.ts:488` covers a token-to-token mock-agent preview.
  - `tests/unit/smithii-tools.test.ts:228` covers token-to-token Smithii mock behavior.

### 9. Generic swap messages send a public roster before wallet count is chosen

- Prior verdict: CONFIRMED
- Follow-up verdict: CLOSED
- Evidence:
  - `src/components/smithii-agent-app.tsx:912` only builds an intent-time swap selection when the message looks complete enough for selection.
  - Generic `bundle swap`/`swap` messages now send `null` selection until the draft has `walletCount`.

### 10. Swap preview table omits per-row amount units

- Prior verdict: CONFIRMED
- Follow-up verdict: CLOSED
- Evidence:
  - `src/components/smithii-agent-app.tsx:721` renders planned amount through `plannedAmountLabel`.
  - `src/components/smithii-agent-app.tsx:1022` derives `%` vs `SOL` from the preview quantity label.

## Disagreements

None in this follow-up. The previous mock-routing finding remains a design choice and was not reclassified.

## Design Choices

Still accepted as design choices:

- Mock routing uses token-label heuristics until a real token-state adapter is wired.
- Local file-backed plan/audit persistence remains mock/local development state.
- Mock signatures and deterministic demo defaults remain valid for Phase 4.

## Dead Code

No dead code findings.

## Disputed Findings

None.

## Coverage Gaps

- No browser-level UI test exercises the exact fetch payload from `SmithiiAgentApp`; helper and route tests cover the underlying behavior.
- Mock routing is still intentionally not live RPC token-state detection.

## Confirmed Cleanup Backlog

No open cleanup backlog remains from this follow-up.

## Run Stats

- Research mode: single-thread fallback
- Prior findings checked: 10
- Closed findings: 10
- Open confirmed findings: 0
- Partial findings: 0
- Disputed findings: 0
- Design choices retained: 3
- Verification commands passed: 4

## Terminal Summary

```text
SMAC complete - 0 findings (0 confirmed, 0 partial, 0 disputed)
Full report: docs/smac-reports/2026-04-30-smithii-agent-phase4-cleanup-followup-smac.md

Top 5:
  1. [INFO/100%] Prior Phase 4 cleanup backlog is closed
  2. [INFO/100%] Targeted tests pass
  3. [INFO/100%] Full test suite passes
  4. [INFO/100%] Lint passes
  5. [INFO/100%] Build passes

Next step: merge Phase 4 branch when ready, or run a broader phase-level SMAC if you want a second full audit.
```
