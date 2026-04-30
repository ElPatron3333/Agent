# SMAC Report: Smithii Agent Phase 5 Cleanup Follow-up

Date: 2026-04-30
Branch: `feature/phase5-volume-bot`
Commit audited: `145dd14 Fix phase 5 volume bot audit findings`
Mode: `general`
Coverage: multi-agent research and verification

## Scope

Focused post-cleanup SMAC for the Phase 5 Volume Bot cleanup delta after the prior Phase 5 report:

- Prior report: `docs/smac-reports/2026-04-30-smithii-agent-phase5-volume-bot-smac.md`
- Cleanup diff: `1b5e4bd..145dd14`
- Primary files checked:
  - `src/app/api/chat/route.ts`
  - `src/lib/agent/mock-chat.ts`
  - `src/lib/smithii/mock.ts`
  - `src/lib/smithii/types.ts`
  - `src/components/smithii-agent-app.tsx`
  - `src/lib/wallet-roster.ts`
  - Phase 5 unit tests
  - `PLAN.md`

Verification commands run during synthesis:

- `pnpm test tests/unit/chat-route.test.ts tests/unit/mock-agent.test.ts tests/unit/smithii-tools.test.ts` -> 60 passed
- `pnpm test` -> 88 passed
- `pnpm lint` -> passed
- `pnpm build` -> passed
- `git diff --check 1b5e4bd..145dd14` -> passed

## Prior Finding Closure

All 11 prior Phase 5 findings are closed enough for merge.

1. Confirm-plus-draft requests are rejected before plan claim, with regression coverage at `tests/unit/chat-route.test.ts:609`.
2. Empty Volume Bot sell-strategy legs are rejected by route parsing at `src/app/api/chat/route.ts:673`.
3. Complete Volume Bot drafts now require public volume-wallet selection at `src/app/api/chat/route.ts:162`.
4. Volume Bot IDs include a material config hash at `src/lib/smithii/mock.ts:191`.
5. Mixed or negated Volume Bot option replies reprompt through parser ambiguity guards.
6. Multi-leg Sell Strategy was intentionally narrowed to one MVP leg in `PLAN.md` and validation.
7. Sell-strategy legs are capped by `VOLUME_BOT_SELL_STRATEGY_LEG_LIMIT = 1`.
8. UI now uses explicit selected volume-wallet state before sending `volumeWalletSelection`.
9. Status UI is documented and labeled as a mock execution snapshot, not polling.
10. PLAN fee example now matches the implemented formula.
11. Route-level `start` alias has direct replay coverage.

## Ranked Findings

### 1. One-leg MVP limit is not encoded in the exported Volume Bot type

Verdict: CONFIRMED
Impact: LOW
Confidence: 0.88
Score: 0.88

Evidence:

- `src/lib/smithii/types.ts:82`

```ts
type VolumeBotSellStrategy = {
  sellMode: "sell_strategy";
  sellStrategy: {
    legs: [VolumeBotSellStrategyLeg, ...VolumeBotSellStrategyLeg[]];
  };
};
```

- `src/lib/smithii/mock.ts:250`

```ts
if (input.sellStrategy.legs.length > VOLUME_BOT_SELL_STRATEGY_LEG_LIMIT) {
```

The cleanup added a one-leg MVP runtime cap, but the exported `VolumeBotInput` type still permits one or more legs. Direct TypeScript callers can build a multi-leg `VolumeBotInput` that only fails at runtime. Route and mock validation already block the dangerous path, so this is a type-contract cleanup issue rather than a runtime blocker.

Recommendation: change the type to an exact one-leg tuple, `legs: [VolumeBotSellStrategyLeg]`, unless multi-leg type flexibility is intentionally preserved for a later Smithii adapter.

### 2. Direct Smithii mock status tests still use the pre-hash Volume Bot run ID shape

Verdict: CONFIRMED
Impact: LOW
Confidence: 0.82
Score: 0.82

Evidence:

- `tests/unit/smithii-tools.test.ts:417`

```ts
it("returns deterministic mock volume bot status and pause results", () => {
  expect(getVolumeBotStatus({ runId: "run_bot_volume_200_Mint111" })).toEqual({
```

- `src/lib/smithii/mock.ts:191`

```ts
botId: `bot_volume_${input.makers}_${input.tokenAddress}_${volumeBotPlanHash(input)}`,
```

The cleanup changed prepared Volume Bot IDs to include a material-config hash. Route tests cover hashed run IDs from generated pending plans, but the direct Smithii mock status/pause test still uses the legacy un-hashed fixture. Runtime behavior is not currently broken because status parsing reads the maker count prefix, but the test no longer pins the actual generated ID path.

Recommendation: derive the status test run ID from `prepareVolumeBot` plus `executeVolumeBot`, or add a direct hashed-run-ID status assertion.

### 3. Stale test-only Volume Bot helper still encodes implicit wallet auto-selection

Verdict: PARTIAL
Impact: LOW
Confidence: 0.86
Score: 0.43

Evidence:

- `src/lib/wallet-roster.ts:157`

```ts
export function buildVolumeWalletSelection({
  roster,
}: {
  roster: BrowserWalletEntry[];
}): VolumeWalletSelection {
```

- `tests/unit/wallet-roster.test.ts:233`

```ts
it("builds a volume bot wallet selection without private keys", () => {
```

The exported helper still selects the first bundle wallet, but reference search shows it is only used by its unit test. The live app no longer imports it; Volume Bot preview requests use `selectedVolumeWalletPubkey` and return `null` without explicit selection. This does not keep the prior UI finding open, but it is a future cleanup candidate because it preserves the old implicit-selection behavior as a tested helper.

Recommendation: remove the helper and test, or replace it with an explicit selected-pubkey helper in a later cleanup pass. Do not block the Phase 5 merge on this.

## Disagreements

- The stale `buildVolumeWalletSelection` helper was reported as a UI cleanup issue. Verification downgraded it to PARTIAL because it is not live-reachable from the UI send path.
- The one-leg type mismatch is confirmed, but low severity because runtime and route validation already enforce the one-leg cap.
- The pre-hash status test is confirmed as a coverage drift issue, not a runtime bug.

## Design Choices

- Mock-first execution remains intentional until Smithii provides the browser-side transaction library.
- Local `.smithii-local` persistence remains acceptable for mock/local phases.
- Internal camelCase DTOs remain acceptable before the Smithii adapter boundary exists.
- One-leg Sell Strategy is now the documented Phase 5 MVP scope.
- Volume Bot status UI is intentionally a mock execution snapshot, not live polling.

## Dead Code

No dead code finding was promoted. `buildVolumeWalletSelection` is stale and test-only, but not currently dead code by strict reference search because its unit test imports it.

## Disputed Findings

No findings were fully disputed.

## Coverage Gaps

- UI behavior was verified statically and through existing tests; no fresh Playwright browser run was performed in this follow-up.
- `pnpm exec tsc --noEmit` was attempted by a verifier and hit existing test narrowing issues, so type-level regression coverage remains indirect through `pnpm build` and Vitest.
- No private Smithii partner schema is available, so live adapter parity remains out of scope.

## Confirmed Cleanup Backlog

### 1. Encode the one-leg Volume Bot Sell Strategy MVP in the exported type

- Category: strong-types
- Files in scope:
  - `src/lib/smithii/types.ts`
  - `tests/unit/smithii-tools.test.ts`
- Recommended write owner or work package: Volume Bot type contract cleanup
- Verification command or check: `pnpm test tests/unit/smithii-tools.test.ts tests/unit/mock-agent.test.ts tests/unit/chat-route.test.ts`; `pnpm build`
- Dependencies on other findings: none
- Safe to batch with adjacent work: yes, with the status fixture cleanup

### 2. Update direct Volume Bot status tests to use generated hashed run IDs

- Category: legacy-removal
- Files in scope:
  - `tests/unit/smithii-tools.test.ts`
- Recommended write owner or work package: Smithii mock test contract cleanup
- Verification command or check: derive `botId` from `prepareVolumeBot`, execute it, and assert `getVolumeBotStatus` on `run_${botId}`; run `pnpm test tests/unit/smithii-tools.test.ts`
- Dependencies on other findings: none
- Safe to batch with adjacent work: yes, with the one-leg type cleanup

The partial stale-helper issue is not promoted into the confirmed cleanup backlog because it is not live-reachable. It can be handled later as optional local cleanup.

## Run Stats

- Domain researchers: 5 usable
- Skeptic roles: exactly 1
- Verifiers: 3 usable
- Prior findings checked: 11
- Prior findings closed: 11
- New confirmed findings: 2 low-severity
- Partial findings: 1
- Disputed findings: 0
- Design choices retained: 5
- Dead code findings: 0
- Rubber-stamp verification detected: no

## Terminal Summary

SMAC complete - 3 findings (2 confirmed, 1 partial, 0 disputed)
Full report: `docs/smac-reports/2026-04-30-smithii-agent-phase5-cleanup-followup-smac.md`

Top 5:

1. [LOW/88%] One-leg MVP limit is not encoded in the exported Volume Bot type
2. [LOW/82%] Direct Smithii mock status tests still use the pre-hash Volume Bot run ID shape
3. [LOW/86%] Stale test-only Volume Bot helper still encodes implicit wallet auto-selection

Next step: use cleanup-orchestrator on the two confirmed low-severity cleanup items, or merge Phase 5 if you accept them as non-blocking.
