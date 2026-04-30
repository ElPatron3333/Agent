# SMAC Report: Smithii Agent Phase 5 Volume Bot

Date: 2026-04-30
Branch: `feature/phase5-volume-bot`
Commit audited: `216d897 Add phase 5 volume bot flow`
Mode: `general`
Coverage: multi-agent research and verification

## Scope

Audited the Phase 5 Volume Bot implementation and adjacent security/UX boundaries:

- `src/lib/agent/mock-chat.ts`
- `src/app/api/chat/route.ts`
- `src/components/smithii-agent-app.tsx`
- `src/lib/smithii/mock.ts`
- `src/lib/smithii/types.ts`
- `src/lib/wallet-roster.ts`
- Phase 5 unit tests
- `PLAN.md` and `AGENTS.md`

Verification commands run after synthesis:

- `pnpm test` -> 82 passed
- `pnpm lint` -> passed
- `pnpm build` -> passed

## Ranked Findings

### 1. Confirm-plus-draft requests can consume a pending plan without executing it

Verdict: CONFIRMED
Impact: HIGH
Confidence: 0.90
Score: 2.70

Evidence:

- `src/app/api/chat/route.ts:161`

```ts
if (pendingPlan && isConfirmMessage(body.message) && !claimPlanRecord(sessionId, pendingPlan)) {
```

- `src/app/api/chat/route.ts:175`

```ts
const result = handleMockChat({
  message: body.message,
  pendingPlan,
  draft,
```

- `src/lib/agent/mock-chat.ts:211`

```ts
if (draft?.tool === "bundle_launch") {
```

- `src/lib/agent/mock-chat.ts:231`

```ts
if (draft?.tool === "volume_bot") {
```

The route claims a signed plan before dispatching to `handleMockChat`. `handleMockChat` prioritizes draft collection before confirm execution, so a request containing both `message: "confirm"` and a `draft` can burn the old pending plan without a mock execution outcome. Existing route coverage only proves non-confirm draft messages preserve a pending plan (`tests/unit/chat-route.test.ts:569`).

Recommendation: reject requests that combine a confirm intent with an active draft, or move `claimPlanRecord` so it only runs after dispatch decides the pending plan will be executed or expired. Add a direct route regression for `pendingPlan + draft + confirm`.

### 2. Empty Volume Bot sell strategy legs can pass route parsing and crash later

Verdict: CONFIRMED
Impact: MED
Confidence: 0.95
Score: 1.90

Evidence:

- `src/app/api/chat/route.ts:654`

```ts
if (value.sellStrategy !== undefined) {
  if (!isRecord(value.sellStrategy) || !Array.isArray(value.sellStrategy.legs)) {
```

- `src/app/api/chat/route.ts:658`

```ts
const legs = value.sellStrategy.legs.map((leg) => {
```

- `src/lib/agent/mock-chat.ts:1429`

```ts
if (!sellStrategy?.legs.length) {
  throw new Error("Volume Bot draft is incomplete.");
}
```

The route parser accepts `{ sellStrategy: { legs: [] } }` because it only rejects malformed leg entries. A complete direct draft then reaches `requireCompleteVolumeBotDraft`, throws, and becomes a 500. Local reproduction against the dev route returned HTTP 500 for this payload.

Recommendation: reject empty `sellStrategy.legs` in `parseVolumeBotDraftData` and add a route test expecting `400 Invalid draft.`.

### 3. Complete Volume Bot drafts can use a hard-coded fallback wallet at the route boundary

Verdict: CONFIRMED
Impact: MED
Confidence: 0.88
Score: 1.76

Evidence:

- `src/app/api/chat/route.ts:336`

```ts
if (value === undefined || value === null) {
  return null;
}
```

- `src/lib/agent/mock-chat.ts:1168`

```ts
const volumeWalletPubkey =
  volumeWalletSelection?.volumeWalletPubkey ?? "VolumeWallet...5sTq";
```

- `PLAN.md:175`

```ts
volume_wallet_pubkey: string,        // funder, selected from roster
```

A direct `/api/chat` request with a complete `volume_bot` draft and no `volumeWalletSelection` returns a signed preview using `VolumeWallet...5sTq`. Local reproduction returned HTTP 200. Normal UI sends a public selection for active volume drafts, so this is primarily a route-boundary issue.

Recommendation: require `volumeWalletSelection` for any complete Volume Bot preview at the route boundary, mirroring the Bundle Swap selected-wallet guard. Keep fallback only in direct helper tests if needed.

### 4. Volume Bot IDs collide across materially different configs

Verdict: CONFIRMED
Impact: MED
Confidence: 0.90
Score: 1.80

Evidence:

- `src/lib/smithii/mock.ts:190`

```ts
botId: `bot_volume_${input.makers}_${input.tokenAddress}`,
```

- `src/lib/smithii/types.ts:64`

```ts
type VolumeBotBaseInput = {
  volumeWalletPubkey: string;
  tokenAddress: string;
  makers: number;
```

`botId` ignores wallet, order range, delay range, sell behavior, sell strategy, and global settings. Two different Volume Bot previews for the same maker count and token receive the same pending-plan ID and audit/run identity.

Recommendation: include a stable hash of material `VolumeBotInput` fields in the mock `botId`, similar to Bundle Swap’s plan hash. Add a regression proving materially different Volume Bot configs get distinct IDs.

### 5. Volume parser can invert intent on mixed or negated replies

Verdict: CONFIRMED
Impact: MED
Confidence: 0.80
Score: 1.60

Evidence:

- `src/lib/agent/mock-chat.ts:1620`

```ts
if (/\bauto\s*sell\b|\bsell\b/.test(normalized)) {
  return "auto_sell";
}
if (/\breturn\b|\bwallet\b/.test(normalized)) {
  return "return_to_wallet";
}
```

- `src/lib/agent/mock-chat.ts:1644`

```ts
if (/\bsell\s*100\b|\b100%?\b|\ball\b/.test(normalized)) {
  return "sell_100";
}
if (/\bstrategy\b/.test(normalized)) {
  return "sell_strategy";
}
```

Replies such as `do not sell, return to wallet` match `sell` first and become `auto_sell`. Replies like `sell strategy, not sell 100` can become `sell_100`. Preview-before-confirm reduces blast radius, but the parsed preview can still show the opposite operational choice.

Recommendation: reject ambiguous replies containing both option families, or require exact option phrases for these binary fields. Add mixed/negated parser tests.

### 6. Multi-leg Sell Strategy is in the contract but the chat flow collects only one leg

Verdict: CONFIRMED
Impact: MED
Confidence: 0.82
Score: 1.64

Evidence:

- `PLAN.md:533`

```text
Sell Strategy legs (define each leg as % range + delay range):
[user defines 3 legs]
```

- `src/lib/agent/mock-chat.ts:1149`

```ts
nextDraft.data.sellStrategy = {
  legs: [strategyLeg],
};
```

- `tests/unit/mock-agent.test.ts:728`

```ts
).toEqual([
  {
    sellPct: { min: 1, max: 33 },
```

The type and PLAN support multiple strategy legs, and the route can accept prebuilt multi-leg drafts, but the reachable conversational flow finalizes after one leg.

Recommendation: either update Phase 5 scope/docs to one leg, or add a multi-leg collection path with an explicit termination action and tests for at least two legs.

### 7. Volume sell strategy legs are unbounded

Verdict: CONFIRMED
Impact: LOW
Confidence: 0.78
Score: 0.78

Evidence:

- `src/app/api/chat/route.ts:658`

```ts
const legs = value.sellStrategy.legs.map((leg) => {
```

- `src/lib/smithii/mock.ts:230`

```ts
for (const leg of input.sellStrategy.legs) {
```

- `src/components/smithii-agent-app.tsx:830`

```tsx
{preview.sellStrategy.legs.map((leg, index) => (
```

Direct route clients can send a very large `legs` array. The route maps it, the Smithii mock validates it, and the UI renders it. Deployment body-size limits reduce severity, but there is no app-level cap.

Recommendation: add a documented max leg count. If current chat scope remains one leg, set the cap to `1`; otherwise choose a small Smithii-compatible max and test over-limit rejection.

### 8. Volume Bot wallet is auto-selected in the UI without an explicit picker

Verdict: CONFIRMED
Impact: MED
Confidence: 0.78
Score: 1.56

Evidence:

- `src/components/smithii-agent-app.tsx:152`

```tsx
volumeWalletSelection: volumeSelectionForDraft(draft, walletRoster),
```

- `src/components/smithii-agent-app.tsx:1032`

```tsx
function volumeSelectionForDraft(
  draft: Draft | null,
  walletRoster: BrowserWalletEntry[],
) {
```

- `src/lib/wallet-roster.ts:162`

```ts
const volumeWallet = roster
  .filter((wallet) => wallet.role === "bundle")
  .sort(compareSelectionPriority)[0];
```

The preview displays the chosen wallet, and no private keys are sent, but the user never explicitly chooses the Volume Bot funding wallet. Imported bundle wallets can be prioritized automatically.

Recommendation: add a small Volume Bot wallet selector or a per-wallet action in the roster panel, then pass that explicit public key to the route.

### 9. Status/pause UI is a one-shot local snapshot, not polling-backed

Verdict: CONFIRMED
Impact: LOW
Confidence: 0.76
Score: 0.76

Evidence:

- `src/components/smithii-agent-app.tsx:179`

```tsx
setVolumeBotRun(result.volumeBotRun ?? null);
```

- `src/components/smithii-agent-app.tsx:463`

```tsx
onClick={() =>
  setVolumeBotRun((current) =>
```

- `PLAN.md:309`

```text
- [FE-9] Volume Bot status polling UI (progress bars, pause button).
```

The run panel shows the initial mock status and a local pause state. There is no polling route or refreshed status path. This is acceptable as a mock-first shortcut only if Phase 5 is scoped to a status snapshot.

Recommendation: either implement a mock status route/polling loop, or relabel/document the panel as a snapshot until Smithii provides lifecycle endpoints.

### 10. PLAN Volume Bot fee example conflicts with implemented total formula

Verdict: CONFIRMED
Impact: LOW
Confidence: 0.92
Score: 0.92

Evidence:

- `PLAN.md:531`

```text
Makers: default 100, order amount range 0.01–0.02, delay 10–20s
```

- `PLAN.md:535`

```text
Agent: [preview: service fee 0.025 SOL, total est. fees 0.3 SOL]
```

- `src/lib/smithii/mock.ts:186`

```ts
const averageOrderSol = (input.orderAmount.minSol + input.orderAmount.maxSol) / 2;
const estimatedTradingBudgetSol = input.makers * averageOrderSol;
```

The implemented and tested formula gives `100 * 0.015 + 0.025 = 1.525 SOL`, not `0.3 SOL`.

Recommendation: correct the PLAN example or split/rename the preview field if “estimated total fees” is supposed to exclude trading budget.

### 11. Route-level `start` confirmation alias lacks direct replay coverage

Verdict: CONFIRMED
Impact: LOW
Confidence: 0.82
Score: 0.82

Evidence:

- `src/app/api/chat/route.ts:828`

```ts
function isConfirmMessage(message: string) {
  return /^(confirm|launch|start|go|yes|execute)$/.test(
```

- `src/lib/agent/mock-chat.ts:1200`

```ts
text: "Volume Bot preview is ready. Type start or confirm to execute the mock handoff.",
```

Route replay tests use `confirm`, while Phase 5 advertises `start` for Volume Bot. The same parser should consume/replay-protect `start`, but there is no direct route regression.

Recommendation: add a route test that confirms a Volume Bot with `start`, then proves replay is rejected.

## Design Choices And Filtered False Positives

- Deterministic `executeVolumeBot`, `getVolumeBotStatus`, and `pauseVolumeBot` are mock-first design choices, not live Smithii defects.
- Local `.smithii-local` plan/audit persistence remains acceptable for the mock phase.
- Internal camelCase DTOs are acceptable until the Smithii adapter boundary exists.
- Route acceptance of prebuilt multi-leg drafts is a design choice because the shared contract supports `legs: Array<...>`, even though the chat flow cannot collect multiple legs.
- Public Smithii docs may not match the private partner API. Treat field-shape parity as PARTIAL/UNVERIFIED until Smithii supplies the browser-side integration schema.

## Disagreements

- Volume wallet fallback was rated PARTIAL by one verifier because the normal UI sends a public selection. Synthesis promotes it to CONFIRMED because `/api/chat` is an untrusted route boundary and local reproduction returned a signed preview without selection.
- Pause/status was split: stateless Smithii mock helpers are a design choice, while the UI claiming Phase 5 polling/status coverage without polling is a confirmed feature gap.
- Multi-leg route acceptance is not a bug by itself; the confirmed issue is the mismatch between documented multi-leg chat flow and one-leg collector.

## Dead Code

No dead code findings were confirmed.

## Disputed Findings

No findings were fully disputed after verification.

## Coverage Gaps

- No private Smithii partner schema was available, so public-doc schema drift remains PARTIAL/UNVERIFIED.
- No component-test framework exists in the repo, so UI findings were verified through source review and prior Playwright smoke testing rather than automated component tests.
- The route confirmation ordering finding was verified by code-path review and verifier reasoning; ad-hoc dev-server cookie tests were inconclusive because PowerShell request replay did not reproduce the browser cookie/session behavior reliably.

## Confirmed Cleanup Backlog

### 1. Move pending-plan claim after execution dispatch or reject confirm+draft

- Category: error-handling
- Files in scope:
  - `src/app/api/chat/route.ts`
  - `src/lib/agent/mock-chat.ts`
  - `tests/unit/chat-route.test.ts`
- Recommended write owner/work package: route boundary and confirmation lifecycle
- Verification command/check: add route regression for `pendingPlan + draft + confirm`; run `pnpm test tests/unit/chat-route.test.ts`
- Dependencies: none
- Safe to batch: yes, with Volume Bot route validation fixes

### 2. Require Volume Bot wallet selection at the route boundary

- Category: error-handling
- Files in scope:
  - `src/app/api/chat/route.ts`
  - `src/lib/agent/mock-chat.ts`
  - `tests/unit/chat-route.test.ts`
- Recommended write owner/work package: route boundary and wallet-selection validation
- Verification command/check: direct complete `volume_bot` draft without `volumeWalletSelection` returns `400`
- Dependencies: none
- Safe to batch: yes, with empty-legs validation

### 3. Harden Volume Bot sell-strategy leg validation

- Category: strong-types
- Files in scope:
  - `src/app/api/chat/route.ts`
  - `src/lib/smithii/mock.ts`
  - `src/lib/smithii/types.ts`
  - `tests/unit/chat-route.test.ts`
  - `tests/unit/smithii-tools.test.ts`
- Recommended write owner/work package: Volume Bot draft schema validation
- Verification command/check: empty `legs` returns `400`; over-limit leg arrays return `400`
- Dependencies: decide max leg count, either `1` or documented small cap
- Safe to batch: yes, with multi-leg scope clarification

### 4. Make mock Volume Bot IDs config-sensitive

- Category: strong-types
- Files in scope:
  - `src/lib/smithii/mock.ts`
  - `tests/unit/smithii-tools.test.ts`
  - `tests/unit/mock-agent.test.ts`
  - `tests/unit/chat-route.test.ts`
- Recommended write owner/work package: Smithii mock identity and pending-plan determinism
- Verification command/check: materially different Volume Bot inputs produce different `botId`s; existing execution tests updated
- Dependencies: none
- Safe to batch: yes, but expect snapshot/string test updates

### 5. Reject ambiguous Volume Bot parser replies

- Category: error-handling
- Files in scope:
  - `src/lib/agent/mock-chat.ts`
  - `tests/unit/mock-agent.test.ts`
- Recommended write owner/work package: Volume Bot chat collector
- Verification command/check: mixed/negated replies reprompt instead of choosing the first keyword
- Dependencies: none
- Safe to batch: yes, with multi-leg collector work

### 6. Align Sell Strategy leg scope

- Category: strong-types
- Files in scope:
  - `PLAN.md`
  - `src/lib/agent/mock-chat.ts`
  - `src/app/api/chat/route.ts`
  - `tests/unit/mock-agent.test.ts`
  - `tests/unit/chat-route.test.ts`
- Recommended write owner/work package: Volume Bot Sell Strategy UX contract
- Verification command/check: either multi-leg collection test passes, or PLAN/test route cap confirms one-leg MVP
- Dependencies: product decision: one-leg MVP vs multi-leg Phase 5
- Safe to batch: yes, after the product decision

## Run Stats

- Domain researchers: 5 usable
- Skeptic roles: exactly 1
- Verifiers: 4 usable
- Findings considered: 15 raw, 11 retained in report
- Confirmed: 11
- Partial: 1 schema-parity note retained as design/filter, not ranked as cleanup
- Disputed: 0
- Design choices: 5
- Dead code: 0
- Rubber-stamp verification detected: no

## Terminal Summary

SMAC complete - 11 findings (11 confirmed, 0 partial ranked, 0 disputed)
Full report: `docs/smac-reports/2026-04-30-smithii-agent-phase5-volume-bot-smac.md`

Top 5:

1. [HIGH/90%] Confirm-plus-draft requests can consume a pending plan without executing it
2. [MED/95%] Empty Volume Bot sell strategy legs can pass route parsing and crash later
3. [MED/88%] Complete Volume Bot drafts can use a hard-coded fallback wallet at the route boundary
4. [MED/90%] Volume Bot IDs collide across materially different configs
5. [MED/80%] Volume parser can invert intent on mixed or negated replies

Next step: use `cleanup-orchestrator` on the confirmed cleanup backlog.
