# SMAC Report: Smithii Agent Phase 7

Date: 2026-05-05
Mode: general
Target: Phase 7 audit log + safety hardening on `main`
Head: `7031d10 Add phase 7 safety hardening`

## Scope

Audited the Phase 7 delta and adjacent execution boundary:

- `src/app/api/chat/route.ts`
- `src/lib/rate-limit.ts`
- `src/lib/audit-log.ts`
- `src/app/api/audit-log/route.ts`
- `tests/unit/chat-route.test.ts`
- `tests/unit/audit-log-route.test.ts`
- `docs/smac-reports/2026-05-04-smithii-agent-phase7-key-handling-report.md`
- Phase 7/BE-7/QA-5 requirements in `PLAN.md`

## Verification Run

- `pnpm test tests/unit/chat-route.test.ts`: 24 passed
- `pnpm test tests/unit/chat-route.test.ts tests/unit/audit-log-route.test.ts tests/unit/plan-signing-secret.test.ts`: 29 passed
- `pnpm test`: 10 files passed, 111 tests passed; Node emitted the existing `punycode` deprecation warning
- `pnpm lint`: passed
- `pnpm build`: passed

## Ranked Findings

### 1. Private-key guard misses repo-known private-key aliases

- Verdict: CONFIRMED
- Score: 1.36
- Impact: MED
- Confidence: 0.85
- Files: `src/app/api/chat/route.ts:1091`, `src/app/api/chat/route.ts:1102`, `tests/unit/chat-route.test.ts:60`, `docs/smithii-sdk-spike.md:23`, `docs/smithii-sdk-spike.md:47`, `docs/smithii-sdk-spike.md:69`, `src/lib/smithii/sdk-adapter.ts:62`
- Evidence:

```ts
return Object.entries(value).some(
  ([key, nestedValue]) =>
    key === "privateKey" || containsPrivateKeyField(nestedValue),
);
```

The route recursively rejects only the exact key `privateKey`. The Smithii SDK spike and adapter identify private-key-bearing shapes using `buyers[].pk`, `privKeys[]`, and `privateKeys[]`. The current test covers only `privateKey`.

- Verification: Code match confirmed. Tests cover exact `privateKey` only. Current parsers drop unknown fields and audit records do not copy them, so no response/audit leak was proven today. Runtime impact is boundary hardening: private-key material under known SDK names can still reach the route handler, which is weaker than the zero-custody backend rule.
- Recommendation: Add a small deny-list for known key-material aliases, preferably case-insensitive for exact token names, and route tests for `pk`, `privKeys`, `privateKeys`, `private_key`, `secretKey`, and `seedPhrase`.
- Why this might be wrong: The current browser UI sends public selections only, and unknown fields are not echoed or audited.

### 2. Confirm-intent rate limiting consumes quota before proving an execution path exists

- Verdict: CONFIRMED
- Score: 1.29
- Impact: MED
- Confidence: 0.86
- Files: `src/app/api/chat/route.ts:104`, `src/app/api/chat/route.ts:124`, `src/app/api/chat/route.ts:192`, `src/app/api/chat/route.ts:199`, `src/lib/agent/mock-chat.ts:345`, `src/lib/agent/mock-chat.ts:371`
- Evidence:

```ts
if (isConfirmMessage(body.message)) {
  const executeAttempt = consumeExecuteAttempt({ key: sessionId });
```

The limiter charges any confirm alias before invalid pending plans, confirm+draft rejections, claim checks, or `handleMockChat`'s no-plan branch. This enforces confirm words per session, not valid `execute_*` attempts. Repeated harmless `yes`/`start`/malformed confirms can block a later valid confirmation in the same session.

- Verification: Code match confirmed. Tests prove the sixth valid confirm returns `429`, but do not cover no-plan, invalid-plan, confirm+draft, replay, or expired-plan quota precedence. Scope safety is good if moved after validation for valid execution attempts, but brute-force invalid-plan throttling may need a separate limiter.
- Recommendation: Decide policy explicitly. For the plan wording `execute_*`, consume execute quota only after `pendingPlan` is valid for the session and the request is on the execution path. If invalid/replay throttling is desired, add a separate rejection limiter and tests.
- Why this might be wrong: Counting all confirm-like requests may be an intentional brute-force dampener for signed-plan guessing.

### 3. Malformed audit-log line hides all readable records

- Verdict: CONFIRMED
- Score: 1.18
- Impact: MED
- Confidence: 0.78
- Files: `src/lib/audit-log.ts:103`, `src/lib/audit-log.ts:151`, `src/lib/audit-log.ts:154`, `src/lib/audit-log.ts:159`, `src/app/api/audit-log/route.ts:14`
- Evidence:

```ts
return parseAuditLogFile(readFileSync(AUDIT_LOG_PATH, "utf8")) ?? [];
```

For NDJSON logs, any malformed line makes `parseAuditLogFile` return `null`; `readAuditLog()` converts that to `[]`, so `/api/audit-log` can show no records even when earlier lines are valid.

- Verification: Code match confirmed. Tests cover normal records and no-cookie behavior, not malformed/truncated local audit files. Runtime impact is audit completeness rather than private-key leakage.
- Recommendation: Parse NDJSON per line and skip/quarantine only invalid lines, or return an explicit read error instead of silently returning an empty log.
- Why this might be wrong: The current all-or-nothing parser is conservative and avoids exposing unvalidated local data.

### 4. Audit-log route redaction test uses only clean records

- Verdict: PARTIAL
- Score: 0.90
- Impact: MED
- Confidence: 0.75
- Files: `tests/unit/audit-log-route.test.ts:10`, `tests/unit/audit-log-route.test.ts:59`, `src/app/api/audit-log/route.ts:13`, `src/lib/audit-log.ts:183`
- Evidence:

```ts
records: readAuditLog().filter((record) => record.sessionId === sessionId),
```

The test asserts the response does not contain `privateKey` or `signature`, but the seeded audit records never include those fields. `isAuditRecord` validates required fields but does not strip extra properties before returning parsed records.

- Verification: Code match confirmed. Normal `appendAuditRecord` emits safe records, so no app-flow leak was confirmed. A poisoned or legacy local file with extra fields would be returned if it still passes required-field validation.
- Recommendation: Add a regression that seeds an audit line with extra sensitive fields and assert the read path strips or rejects it.
- Why this might be wrong: Only trusted local code writes audit records in normal operation.

### 5. Process-local/session-cookie limiter is a local-only approximation, not a production user limiter

- Verdict: DESIGN_CHOICE / WATCH
- Score: 0.82
- Impact: MED
- Confidence: 0.82
- Files: `src/lib/rate-limit.ts:9`, `src/app/api/chat/route.ts:105`, `src/app/api/chat/route.ts:1088`, `PLAN.md:297`, `PLAN.md:356`
- Evidence:

```ts
const executeAttemptState = new Map<string, RateLimitState>();
```

The limiter is process-local and keyed by a caller-controlled session cookie. It does not enforce `5 execute_*/min/user` across serverless instances, process restarts, cookie rotation, or authenticated users.

- Verification: Code match confirmed. The repo remains mock/local-first (`README.md`, `AGENTS.md`), and no user/auth or Upstash integration exists yet. The Phase 7 DoD says only “Rate limiter enforced,” while BE-7 names Upstash. Skeptic defense applies.
- Recommendation: Keep as local Phase 7 enforcement, but document it as local/session-scoped. Before preview/prod or Phase 8 live execution, replace it with a shared limiter keyed by authenticated user/wallet/session and backed by Upstash/Redis TTL counters.
- Why this might be wrong: If Phase 7 is intended to include BE-7 exactly, this should be promoted to confirmed infrastructure work.

### 6. Rate-limit Map can grow under session churn

- Verdict: PARTIAL
- Score: 0.66
- Impact: LOW
- Confidence: 0.82
- Files: `src/lib/rate-limit.ts:9`, `src/lib/rate-limit.ts:19`, `src/app/api/chat/route.ts:1088`
- Evidence:

```ts
if (!state || now - state.windowStart >= EXECUTE_ATTEMPT_WINDOW_MS) {
  executeAttemptState.set(key, {
```

Expired keys are reset only when the same key returns. High-cardinality session churn can grow the in-memory `Map` for the process lifetime.

- Verification: Code match confirmed. Runtime impact is limited by local/mock scope and serverless process lifetime. Still worth fixing if the local fallback remains.
- Recommendation: Add TTL eviction or a bounded LRU for the local fallback, or rely on shared Upstash counters in the production limiter.
- Why this might be wrong: Short-lived processes may make this practically irrelevant.

### 7. Private-key rejection attempts are not audited

- Verdict: DESIGN_CHOICE
- Score: 0.50
- Impact: LOW
- Confidence: 0.82
- Files: `src/app/api/chat/route.ts:88`, `src/app/api/chat/route.ts:89`, `src/lib/audit-log-types.ts:7`, `src/lib/audit-log-types.ts:11`
- Evidence:

```ts
if (containsPrivateKeyField(parsedBody)) {
  return NextResponse.json({ error: "Invalid request." }, { status: 400 });
}
```

Private-key-bearing requests return before a session is created or an audit record is appended.

- Verification: Code match confirmed. Not logging these attempts can be defensible under “Never log private keys,” because even field-name logging on key-bearing payloads needs careful policy. No cleanup backlog item promoted.
- Recommendation: Decide the policy. If audited, add a payload-free `private_key_rejected` event with no copied field names or values.
- Why this might be wrong: Avoiding any audit write for key-bearing requests may be the safest current behavior.

### 8. Expired plans are claimed before TTL is evaluated

- Verdict: DESIGN_CHOICE
- Score: 0.37
- Impact: LOW
- Confidence: 0.74
- Files: `src/app/api/chat/route.ts:199`, `src/app/api/chat/route.ts:981`, `src/lib/agent/mock-chat.ts:358`, `tests/unit/chat-route.test.ts:822`
- Evidence:

```ts
if (pendingPlan && isConfirmMessage(body.message) && !claimPlanRecord(sessionId, pendingPlan)) {
```

The route marks the plan consumed before `handleMockChat` checks TTL and returns `Preview expired`.

- Verification: The current Phase 7 contract still passes: expired confirm returns `410` and is audited. Skeptic defense applies: consuming an expired confirm is a valid one-shot state transition.
- Recommendation: Keep unless product requires expired plans to remain pending. Before live execution, make the claim/TTL state machine explicit.

### 9. Stale claim locks can strand a local pending plan

- Verdict: PARTIAL
- Score: 0.34
- Impact: LOW
- Confidence: 0.68
- Files: `src/app/api/chat/route.ts:962`, `src/app/api/chat/route.ts:967`, `src/app/api/chat/route.ts:969`, `src/app/api/chat/route.ts:986`, `src/app/api/chat/route.ts:989`
- Evidence:

```ts
lockHandle = openSync(lockPath, "wx");
```

A process crash after lock creation and before `finally` cleanup leaves a `.lock` file that makes future claims return false.

- Verification: Code match confirmed. Runtime requires abnormal process death in a small synchronous critical section. This is local persistence only.
- Recommendation: Add stale-lock cleanup using mtime/TTL if local file persistence remains; production should use transactional/conditional persistence.

### 10. Legacy audit-log array conversion can clobber concurrent appends

- Verdict: PARTIAL
- Score: 0.31
- Impact: LOW
- Confidence: 0.62
- Files: `src/lib/audit-log.ts:93`, `src/lib/audit-log.ts:95`, `src/lib/audit-log.ts:120`, `src/lib/audit-log.ts:127`, `src/lib/audit-log.ts:128`
- Evidence:

```ts
if (content.trim().startsWith("[")) {
  writeFileSync(
```

Legacy array migration rewrites the whole audit file immediately before appending. Concurrent first writes against an old array file can lose one append.

- Verification: Code match confirmed, but impact exists only during legacy migration. Current normal NDJSON appends are not exposed in the same way.
- Recommendation: Convert under a lock or drop legacy array support after the local migration window.

## Disagreements And Disputed Findings

- The rate-limiter researcher reported `pnpm test tests/unit/chat-route.test.ts` failing at `tests/unit/chat-route.test.ts:907`. Fresh verification in the main workspace passed: 24/24 route tests. Verdict: DISPUTED for the failing-test claim, while missing coverage around limiter behavior remains valid.
- Some researchers ranked the local/process limiter as HIGH. Synthesis downgrades it to DESIGN_CHOICE / WATCH for current Phase 7 because the repo is still documented as local/mock-first and no user identity or Upstash dependency exists yet. It becomes confirmed infrastructure work before any production/live execution claim.
- Expired-plan claim-before-TTL was defended by the Skeptic and left as DESIGN_CHOICE because current tests prove the user-visible `410` + audit behavior.

## Design Choices

- Local `.smithii-local` persistence is acceptable for mock-first phases. It is not production audit or plan storage.
- Mock Smithii execution remains intentional until the Smithii browser-side transaction assembly library exists.
- Direct route tests are useful and valid for current boundary logic. They do not replace browser/network tests before beta.
- The Phase 7 key-handling report is correctly scoped as code/test evidence, not a live browser/network pen-test.

## Dead Code

No dead code findings were confirmed in this Phase 7 audit.

## Coverage Gaps

- Skeptic role was delayed by the local agent-thread limit, then completed after researchers finished.
- Verification was partially main-thread synthesis rather than a full circular verifier batch for every researcher.
- No browser Playwright or live HTTP server network-capture test was run.
- No live Smithii API calls were run, by design.

## Run Stats

- Researchers spawned: 6
- Researchers with usable output: 6
- Skeptic roles: 1
- Verified findings synthesized: 10
- Confirmed: 3
- Partial: 4
- Design choice/watch: 3
- Disputed: 1 claim
- Dead code: 0
- Full verification: `pnpm test`, `pnpm lint`, `pnpm build` passed

## Confirmed Cleanup Backlog

### 1. Expand route private-key alias rejection

- Category: error-handling
- Exact files in scope:
  - `src/app/api/chat/route.ts`
  - `tests/unit/chat-route.test.ts`
  - optionally `docs/smac-reports/2026-05-04-smithii-agent-phase7-key-handling-report.md`
- Recommended write owner or work package: chat route security boundary
- Verification command or check: `pnpm test tests/unit/chat-route.test.ts` plus full `pnpm test`
- Dependencies on other findings: none
- Safe to batch with adjacent work: yes, safe with rate-limit test additions

### 2. Move execute rate-limit consumption to the valid execution path or split rejection throttling

- Category: error-handling
- Exact files in scope:
  - `src/app/api/chat/route.ts`
  - `src/lib/rate-limit.ts` if a second limiter or helper is needed
  - `tests/unit/chat-route.test.ts`
- Recommended write owner or work package: confirm/execute route state machine
- Verification command or check: add route tests for no-plan confirms, invalid pending plans, confirm+draft, replay, expired confirm, and valid 6th execution; run `pnpm test tests/unit/chat-route.test.ts`
- Dependencies on other findings: none
- Safe to batch with adjacent work: yes, safe with private-key alias tests

### 3. Make malformed NDJSON audit records fail locally instead of hiding the whole log

- Category: error-handling
- Exact files in scope:
  - `src/lib/audit-log.ts`
  - `tests/unit/audit-log-route.test.ts` or a new audit-log unit test
- Recommended write owner or work package: local audit-log parser resilience
- Verification command or check: seed one valid audit line plus one malformed line and assert valid records remain visible or an explicit read error is returned
- Dependencies on other findings: none
- Safe to batch with adjacent work: yes, but keep separate from route execution changes if possible

## Follow-Up Watch Items

- Document or replace the process-local limiter before preview/prod. Upstash/user-scoped limiting remains Phase 8/live-readiness infrastructure.
- Add a browser/network-capture key-handling test before beta.
- Consider stale-lock cleanup if local plan records keep being used after Phase 7.
- Consider a sanitized policy for private-key rejection audit events.

## Cleanup Follow-Up

Date: 2026-05-05

Status after cleanup:

- Finding 1 fixed: `/api/chat` now rejects `privateKey` plus repo-known key aliases including `pk`, `privKeys`, `privateKeys`, `private_key`, `secretKey`, and `seedPhrase`; route tests cover each alias.
- Finding 2 fixed: execute rate-limit quota is consumed only after a valid pending plan is present and the request is on the execution path; no-plan confirm words no longer burn execute quota.
- Finding 3 fixed: malformed NDJSON lines no longer hide earlier valid audit records.
- Finding 4 fixed: audit-log reads sanitize accepted records before returning them, so extra stored `privateKey` or `signature` fields are stripped.
- Finding 5 deferred: production/user-scoped Upstash rate limiting still requires auth/user identity and the planned production infrastructure; the current limiter remains a local/session-scoped guard.
- Finding 6 fixed for the local fallback: expired limiter entries are pruned, and tests cover pruning plus `Retry-After`/one-minute reset behavior. Production Upstash limiting remains the separate watch item.
- Finding 7 resolved by adding payload-free `private_key_rejected` audit records.
- Finding 8 left as design choice: expired confirmations still consume the one-shot plan and return `410`.
- Finding 9 fixed for local persistence: stale plan lock files older than the plan TTL are cleared before retrying claim.
- Finding 10 mitigated: legacy audit-log array conversion now uses a local lock before rewriting.

Cleanup verification:

- `pnpm test tests/unit/rate-limit.test.ts tests/unit/chat-route.test.ts tests/unit/audit-log-route.test.ts tests/unit/plan-signing-secret.test.ts`: 41 passed

SMAC complete - 10 findings (3 confirmed, 4 partial, 1 disputed claim)
