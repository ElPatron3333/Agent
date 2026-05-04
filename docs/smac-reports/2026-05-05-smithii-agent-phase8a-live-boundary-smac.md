# SMAC Report: Smithii Agent Phase 8A Live Boundary

Date: 2026-05-05
Mode: architecture/security
Target: `feature/phase8a-live-boundary`
Head: `31c2049 Add phase 8A Smithii live boundary`
Coverage: multi-agent research with main-thread verification synthesis; Skeptic role ran in the main thread because the agent thread limit blocked a separate Skeptic spawn.

## Scope

Audited the Phase 8A delta against `main`:

- `src/lib/smithii/live-boundary.ts`
- `src/lib/agent/mock-chat.ts`
- `src/components/smithii-agent-app.tsx`
- `tests/unit/smithii-live-boundary.test.ts`
- `tests/unit/mock-agent.test.ts`
- `tests/unit/chat-route.test.ts`
- `tests/unit/client-chat-state.test.ts`
- `docs/phase8a-live-boundary.md`
- `docs/smithii-sdk-spike.md`
- `PLAN.md` and `AGENTS.md` for project constraints

Researcher roles used: security/redaction, backend live execution boundary, UI/client state, type contracts, docs/Smithii assumptions, test coverage, and a main-thread Skeptic. One backend-boundary researcher was closed after timeout. Five researcher outputs were usable.

## Verification Run

- `pnpm test tests/unit/smithii-live-boundary.test.ts tests/unit/mock-agent.test.ts tests/unit/chat-route.test.ts tests/unit/client-chat-state.test.ts`: 74 passed
- `git diff --check`: passed during synthesis

Full verification after report save is listed in Run Stats.

## Ranked Findings

### 1. `/api/chat` response metadata exposes private-key-shaped SDK arg names

- Verdict: CONFIRMED
- Score: 1.70
- Impact: MED
- Confidence: 0.85
- Files: `src/lib/smithii/live-boundary.ts:33`, `src/lib/smithii/live-boundary.ts:51`, `src/lib/agent/mock-chat.ts:355`, `src/app/api/chat/route.ts:244`, `docs/phase8a-live-boundary.md:32`, `tests/unit/chat-route.test.ts:147`, `tests/unit/chat-route.test.ts:921`
- Evidence:

```ts
browserRequiredSignerArgs: ["buyers[].pk"],
```

```ts
browserRequiredSignerArgs: ["privKeys[]"],
```

The Phase 8A boundary attaches `smithiiLive` to preview results, and the route serializes the full signed result:

```ts
smithiiLive: liveBoundaryForPreview(result.activePreview),
```

```ts
const response = NextResponse.json(signPendingPlanInResult(result, sessionId), {
```

This conflicts with the new Phase 8A response rule:

```md
The `/api/chat` response can include safe live-boundary metadata, but it must not include key values or private-key-shaped field names.
```

Tests reject these aliases in incoming requests:

```ts
it.each(["pk", "privKeys", "privateKeys", "private_key", "secretKey", "seedPhrase"])(
```

But successful response tests only assert no literal `privateKey` string:

```ts
expect(JSON.stringify(preview)).not.toContain("privateKey");
```

- Verification: Code match confirmed. Git intent was display metadata. Test intent currently pins the SDK arg names in helper tests, but route tests do not check `pk` or `privKeys` in successful responses. Reachability is real because `/api/chat` returns the result object. Runtime impact is not secret value leakage, but it weakens the zero-custody response contract and creates a policy/test contradiction.
- Recommendation: Keep exact SDK private-key arg names in docs or internal adapter assessment only. Do not serialize them through `/api/chat`. Replace `browserRequiredSignerArgs` response values with neutral labels such as `bundle buyer signer material` and `bundle swap wallet signer material`, or omit this field from public responses. Add route-level tests that successful responses do not contain `pk`, `privKeys`, `privateKeys`, `private_key`, `secretKey`, or `seedPhrase`.
- Why this might be wrong: These are descriptive SDK field-name strings, not secret values. If the team intentionally allows SDK schema names in public metadata, then the Phase 8A doc and route tests need to say that explicitly.

### 2. UI can show a retained preview while resetting the Phase 8A live status to `Mock`

- Verdict: CONFIRMED
- Score: 1.64
- Impact: MED
- Confidence: 0.82
- Files: `src/components/smithii-agent-app.tsx:201`, `src/components/smithii-agent-app.tsx:204`, `src/components/smithii-agent-app.tsx:1097`, `src/lib/agent/client-chat-state.ts:18`, `src/lib/agent/client-chat-state.ts:26`, `tests/unit/client-chat-state.test.ts:25`
- Evidence:

```tsx
setActivePreview((current) => nextActivePreview(result, current));
rememberLastConfig(result.activePreview);
setExecutionStatus(result.executionStatus);
setSmithiiLive(result.smithiiLive ?? null);
```

`nextActivePreview` intentionally keeps the previous preview on non-terminal responses without a new draft:

```ts
if (result.activePreview) {
  return result.activePreview;
}
```

```ts
return currentPreview;
```

But the component clears `smithiiLive` independently. The label then falls back to Mock:

```tsx
if (!boundary || boundary.mode === "mock") {
  return "Mock";
}
```

- Verification: Code match confirmed. Tests prove preview retention is intentional but do not cover paired live-boundary retention. Reachability is real in the browser after a preview followed by a non-terminal no-preview response. Runtime impact is user-facing semantic drift: a blocked or browser-handoff-ready preview can remain visible while the status rows say `Mock`.
- Recommendation: Store preview and live-boundary state together or add a client helper that computes both together. If a previous preview is retained, retain its matching `smithiiLive`; if `smithiiLive` is intentionally cleared, clear or mark the preview historical at the same time. Add a client-state test for this transition.
- Why this might be wrong: The UI may intend `smithiiLive` to describe only the latest assistant response. If so, retaining the old preview without a historical label is still ambiguous and should be made explicit.

### 3. Real route tests do not pin Phase 8A response modes and mock-confirm boundaries

- Verdict: PARTIAL
- Score: 0.95
- Impact: MED
- Confidence: 0.76
- Files: `src/app/api/chat/route.ts:244`, `src/app/api/chat/route.ts:549`, `src/lib/agent/mock-chat.ts:404`, `src/lib/agent/mock-chat.ts:420`, `src/lib/agent/mock-chat.ts:465`, `tests/unit/chat-route.test.ts:435`, `tests/unit/chat-route.test.ts:546`, `tests/unit/mock-agent.test.ts:1001`
- Evidence:

```ts
const response = NextResponse.json(signPendingPlanInResult(result, sessionId), {
```

```ts
value.direction !== "token_to_token"
```

Mock execution helper results attach mock boundaries:

```ts
smithiiLive: mockLiveBoundaryForTool(pendingPlan.tool),
```

But `rg -n "smithiiLive" tests/unit/chat-route.test.ts` and `rg -n "token_to_token" tests/unit/chat-route.test.ts` returned no matches during the audit. Helper tests cover some classifications, but the route serialization contract is not pinned for token-to-token blocked previews or confirm responses.

- Verification: Code match confirmed. Helper tests cover pure boundary classification. Route tests cover existing preview behavior and response redaction only partially. Reachability is real because the route accepts `token_to_token` drafts and serializes `smithiiLive` responses.
- Recommendation: Add route-level assertions for `smithiiLive.mode` and `serverExecution` for bundle launch, SOL/token bundle swap, token-to-token bundle swap, Volume Bot, launch+volume preview, and confirm responses. The most important route case is token-to-token because the route parser accepts it and Phase 8A must classify it as blocked for live handoff.
- Why this might be wrong: If route tests are treated as transport-only and helper tests are the source of truth for boundary classification, this is a test-depth gap rather than a product bug.

### 4. Blocked live states share generic confirmation wording with mock execution

- Verdict: PARTIAL
- Score: 0.55
- Impact: LOW
- Confidence: 0.68
- Files: `src/components/smithii-agent-app.tsx:394`, `src/components/smithii-agent-app.tsx:395`, `tests/unit/chat-route.test.ts:732`, `tests/unit/chat-route.test.ts:742`
- Evidence:

```tsx
<PreviewRow label="Execute words" value="confirm, launch, start" />
```

```tsx
<PreviewRow
  label="Smithii live"
  value={liveModeLabel(smithiiLive)}
/>
```

The route still executes only mock paths, including Volume Bot `start`:

```ts
message: "start",
```

```ts
expect(await responseJson(startResponse)).toMatchObject({
  executionStatus: "Volume bot started",
});
```

- Verification: No live execution path was found. The issue is UI semantics: users can see `Blocked awaiting Smithii` near generic execute words. The explanatory text reduces the risk, but the row can still read as a live affordance.
- Recommendation: Change the label to `Mock execute words` or condition the text for blocked states, so the confirmation words are not interpreted as live execution.
- Why this might be wrong: The app is still a mock-first tool and most assistant copy says `mock handoff`, so existing wording may be acceptable for Phase 8A.

## Design Choices And Watch Items

### Bundle Swap browser-handoff readiness depends on SDK-resolved routing

- Verdict: DESIGN_CHOICE / WATCH
- Evidence: `src/lib/smithii/sdk-adapter.ts:196` maps `pool`, but installed `@smithii/sdk` currently does `void args.pool` and calls `resolvePumpSwapState(this.connection, args.mint)` in `node_modules/@smithii/sdk/dist/index.js:3962` and `node_modules/@smithii/sdk/dist/index.js:3968`.
- Synthesis: Not a cleanup bug if Smithii owns route resolution inside the SDK. It is a documentation/readiness watch item: Phase 8A should not imply our mock routing controls live SDK routing unless Smithii confirms it.

### Volume Bot blockers omit `apiBaseUrl` and backend-bot mediation details

- Verdict: DESIGN_CHOICE / WATCH
- Evidence: `node_modules/@smithii/sdk/dist/anti-mev/index.d.ts:71` requires `apiBaseUrl`, and comments around `node_modules/@smithii/sdk/dist/anti-mev/index.d.ts:88` describe a backend-built deposit tx and backend bot start after confirmation.
- Synthesis: The current branch already blocks Volume Bot live handoff, so this is not a code execution bug. Add these specifics to the Smithii question list before attempting Phase 8B.

### `PLAN.md` executive summary still sounds more confirmed than Phase 8A

- Verdict: DESIGN_CHOICE / WATCH
- Evidence: `PLAN.md:18` says Smithii will provide the browser-side tx assembly module, while `AGENTS.md:9` and `docs/phase8a-live-boundary.md:46` still treat it as a blocker/question.
- Synthesis: This is stale wording risk, not a runtime bug. It should be cleaned up when the Smithii question packet is prepared.

### Volume Bot question wording differs across docs/runtime

- Verdict: LOW / COMMENT-SLOP
- Evidence: runtime asks about `onPurchase`, `sellTiming`, `sellMode`, `sellStrategy`; adapter/docs also use user-facing terms like auto-sell and return-to-wallet.
- Synthesis: Both refer to the same unresolved product behavior. Align wording before sending the Smithii question packet.

## Disputed Findings

- `browser-handoff-ready` for Bundle Launch was reported as possibly overstating readiness. Synthesis leaves it as a design choice because Phase 8A explicitly defines the term as `known SDK target, browser execution required`, not live-ready-to-run.
- Stringly typed `sdkMethod`, `browserRequiredSignerArgs`, and `questionsForSmithii` were not promoted as standalone defects. They are acceptable while used as display/documentation metadata. The risk increases if these strings drive live execution logic.

## Dead Code

No dead code findings were confirmed in the Phase 8A delta.

## Coverage Gaps

- Separate Skeptic agent could not be spawned because the thread limit was reached; Skeptic synthesis ran in the main thread.
- One backend-boundary researcher did not return and was closed after timeout.
- No browser Playwright screenshot or interaction test was run.
- No live Smithii SDK execution was run, by design.
- No Smithii sandbox/devnet calls were run.

## Run Stats

- Researchers spawned: 6
- Researchers with usable output: 5
- Skeptic roles: 1 main-thread fallback
- Confirmed findings: 2
- Partial findings: 2
- Design choice/watch items: 4
- Disputed findings: 2
- Dead code: 0
- Focused verification: `pnpm test tests/unit/smithii-live-boundary.test.ts tests/unit/mock-agent.test.ts tests/unit/chat-route.test.ts tests/unit/client-chat-state.test.ts` passed, 74 tests
- Full verification after report save: `pnpm test` passed, 132 tests; `pnpm lint` passed; `pnpm build` passed; `git diff --check` passed

## Confirmed Cleanup Backlog

### 1. Sanitize Phase 8A public response metadata and route tests

- Category: strong-types
- Exact files in scope:
  - `src/lib/smithii/live-boundary.ts`
  - `tests/unit/smithii-live-boundary.test.ts`
  - `tests/unit/mock-agent.test.ts`
  - `tests/unit/chat-route.test.ts`
  - `docs/phase8a-live-boundary.md`
- Recommended write owner or work package: Smithii live-boundary response contract
- Verification command or check: `pnpm test tests/unit/smithii-live-boundary.test.ts tests/unit/mock-agent.test.ts tests/unit/chat-route.test.ts`
- Dependencies on other findings: none
- Safe to batch with adjacent work: yes, safe with route-level Phase 8A test additions

### 2. Keep visible preview and Smithii live-boundary state in sync

- Category: error-handling
- Exact files in scope:
  - `src/lib/agent/client-chat-state.ts`
  - `src/components/smithii-agent-app.tsx`
  - `tests/unit/client-chat-state.test.ts`
- Recommended write owner or work package: client state transition helper
- Verification command or check: `pnpm test tests/unit/client-chat-state.test.ts tests/unit/mock-agent.test.ts`
- Dependencies on other findings: none
- Safe to batch with adjacent work: yes, independent of response metadata cleanup

### 3. Add route-level Phase 8A boundary regression coverage

- Category: error-handling
- Exact files in scope:
  - `tests/unit/chat-route.test.ts`
  - optionally `src/lib/smithii/live-boundary.ts` if response fields change under finding 1
- Recommended write owner or work package: `/api/chat` Phase 8A serialization contract
- Verification command or check: `pnpm test tests/unit/chat-route.test.ts`
- Dependencies on other findings: should follow or batch with finding 1 so assertions use the final sanitized response shape
- Safe to batch with adjacent work: yes, safe with finding 1

### 4. Clarify Phase 8A Smithii readiness docs before merge

- Category: comment-slop
- Exact files in scope:
  - `docs/phase8a-live-boundary.md`
  - `docs/smithii-sdk-spike.md`
  - optionally `PLAN.md`
- Recommended write owner or work package: Smithii question packet/readiness wording
- Verification command or check: `pnpm test tests/unit/smithii-sdk-adapter.test.ts` plus manual doc review against `AGENTS.md`
- Dependencies on other findings: none
- Safe to batch with adjacent work: yes

## Terminal Summary

SMAC complete - 4 ranked findings (2 confirmed, 2 partial); 2 disputed candidates excluded from the ranked cleanup backlog
Full report: docs/smac-reports/2026-05-05-smithii-agent-phase8a-live-boundary-smac.md

Top 5:
  1. [MED/85%] `/api/chat` response metadata exposes private-key-shaped SDK arg names
  2. [MED/82%] UI can show a retained preview while resetting the Phase 8A live status to `Mock`
  3. [MED/76%] Real route tests do not pin Phase 8A response modes and mock-confirm boundaries
  4. [LOW/68%] Blocked live states share generic confirmation wording with mock execution
  5. None

Next step: use cleanup-orchestrator on the confirmed cleanup backlog before merging Phase 8A into main.
