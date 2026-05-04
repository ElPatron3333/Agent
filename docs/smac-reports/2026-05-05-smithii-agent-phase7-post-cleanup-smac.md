# SMAC Report: Smithii Agent Phase 7 Post-Cleanup

Date: 2026-05-05
Mode: cleanup
Target: Focused follow-up on Phase 7 cleanup commit `4cdb3c0 Fix phase 7 audit findings`
Branch: `main`
Coverage: single-thread fallback after CLI close lost the originally spawned SMAC agent contexts

## Scope

This follow-up audit re-checked the 10 findings from `docs/smac-reports/2026-05-05-smithii-agent-phase7-smac.md` against the current `main` tree. It focused on the files changed by cleanup:

- `src/app/api/chat/route.ts`
- `src/lib/audit-log.ts`
- `src/lib/audit-log-types.ts`
- `src/lib/rate-limit.ts`
- `tests/unit/chat-route.test.ts`
- `tests/unit/audit-log-route.test.ts`
- `tests/unit/rate-limit.test.ts`

Because the CLI was closed during the original fan-out run, the researcher and verifier roles were simulated in the main thread. This report does not claim multi-agent consensus coverage.

## Role Design

- Security boundary researcher: private-key ingress and audit payload leakage.
- Confirmation state-machine researcher: pending-plan validation, claim ordering, TTL, and rate-limit behavior.
- Local persistence researcher: file-backed plan and audit log race/stale-state behavior.
- Test coverage researcher: direct regression tests for every prior cleanup item.
- Production-readiness researcher: local mock choices versus Phase 8/live execution requirements.
- Conservative cleanup researcher: whether fixes changed behavior outside the prior findings.
- Skeptic role: defend mock-first/local-only choices and filter production-only false positives.

## Prior Finding Closure

### 1. Private-key guard misses repo-known private-key aliases

Verdict: CLOSED

Evidence:

- `src/app/api/chat/route.ts:65` defines `PRIVATE_KEY_FIELD_NAMES` with `pk`, `privatekey`, `privatekeys`, `private_key`, `privkeys`, `secretkey`, and `seedphrase`.
- `src/app/api/chat/route.ts:102` rejects any request where `containsPrivateKeyField(parsedBody)` is true.
- `src/app/api/chat/route.ts:1119` recursively scans arrays and objects; `src/app/api/chat/route.ts:1134` compares keys case-insensitively.
- `tests/unit/chat-route.test.ts:921` covers `pk`, `privKeys`, `privateKeys`, `private_key`, `secretKey`, and `seedPhrase` anywhere in the request body.

Verification verdict: code match, test intent, and route reachability all match the fix.

### 2. Confirm-intent rate limiting consumes quota before proving an execution path exists

Verdict: CLOSED

Evidence:

- `src/app/api/chat/route.ts:193` only calls `consumeExecuteAttempt` inside `if (pendingPlan && isConfirmMessage(body.message))`.
- Invalid pending-plan payloads are rejected earlier at `src/app/api/chat/route.ts:122`.
- Confirm requests with both `pendingPlan` and `draft` are rejected before rate limiting at `src/app/api/chat/route.ts:185`.
- `tests/unit/chat-route.test.ts:1091` verifies confirm words without an active plan do not spend execute quota.
- `tests/unit/chat-route.test.ts:1018` verifies quota resets after the one-minute window, and `tests/unit/chat-route.test.ts:1012` verifies `Retry-After` on a real limited execution path.

Verification verdict: the prior no-plan quota burn is fixed. A rare lock-contention failure can still spend one quota unit after a valid pending plan is accepted, but that is a different local-concurrency edge and is not the confirmed bug from the prior audit.

### 3. Malformed audit-log line hides all readable records

Verdict: CLOSED

Evidence:

- `src/lib/audit-log.ts:184` parses audit content.
- `src/lib/audit-log.ts:199` iterates NDJSON line by line.
- `src/lib/audit-log.ts:207` skips malformed JSON lines instead of returning `null` for the whole file.
- `tests/unit/audit-log-route.test.ts:132` seeds a valid line plus malformed line and verifies the valid record remains readable.

Verification verdict: code and test coverage directly match the prior failure mode.

### 4. Audit-log route redaction test uses only clean records

Verdict: CLOSED

Evidence:

- `src/lib/audit-log.ts:215` returns only whitelisted audit fields from `sanitizeAuditRecord`.
- `src/lib/audit-log.ts:193` sanitizes legacy array records.
- `src/lib/audit-log.ts:206` sanitizes each valid NDJSON record.
- `tests/unit/audit-log-route.test.ts:99` seeds stored `privateKey` and `signature` fields and verifies they are stripped from `/api/audit-log` output.

Verification verdict: direct poisoned-record coverage exists.

### 5. Process-local/session-cookie limiter is a local-only approximation, not a production user limiter

Verdict: DESIGN_CHOICE / WATCH

Evidence:

- `src/lib/rate-limit.ts:8` still uses an in-memory `Map`.
- `AGENTS.md` and `PLAN.md` keep the current repo in local/mock-first scope until the Smithii browser-side execution library and production infrastructure exist.
- Phase 8/live execution is still blocked on Smithii integration details and auth/user identity.

Verification verdict: not promoted to cleanup backlog for this phase. Before live Smithii execution, replace this with shared user/session-bound enforcement, likely Upstash/Redis plus real auth or wallet-bound identity.

### 6. Rate-limit Map can grow under session churn

Verdict: CLOSED for local fallback

Evidence:

- `src/lib/rate-limit.ts:13` calls `pruneExecuteAttemptRateLimiter(now)` on each consume.
- `src/lib/rate-limit.ts:45` removes expired entries from the process-local map.
- `tests/unit/rate-limit.test.ts:10` covers pruning an expired session entry.

Verification verdict: local fallback growth is bounded by active one-minute entries. Production shared limiting remains the separate watch item from finding 5.

### 7. Private-key rejection attempts are not audited

Verdict: CLOSED

Evidence:

- `src/app/api/chat/route.ts:102` appends `auditRecordForRejectedPrivateKey({ sessionId })` before returning `400`.
- `src/lib/audit-log.ts:92` creates a payload-free `private_key_rejected` record with no copied field names or values.
- `src/lib/audit-log-types.ts:7` includes `private_key_rejected` in the typed event union.
- `src/lib/audit-log.ts:263` accepts `private_key_rejected` when reading local records.

Verification verdict: the event is audited without violating the no-private-key-log rule.

### 8. Expired plans are claimed before TTL is evaluated

Verdict: DESIGN_CHOICE

Evidence:

- Current behavior intentionally keeps one-shot consumption for accepted pending plans, then `handleMockChat` returns `410` for expired previews.
- The previous audit already classified this as a defended design choice.

Verification verdict: unchanged and acceptable for local Phase 7. Before live execution, the plan state machine should be made explicit in server-issued/session-bound persistence.

### 9. Stale claim locks can strand a local pending plan

Verdict: CLOSED

Evidence:

- `src/app/api/chat/route.ts:983` clears stale plan locks after initial lock-open failure.
- `src/app/api/chat/route.ts:1014` removes locks older than `STALE_PLAN_LOCK_MS`.
- `tests/unit/chat-route.test.ts:313` creates an old `.lock` file and verifies a valid confirm still succeeds.

Verification verdict: the local stale-lock case from the prior audit is covered.

### 10. Legacy audit-log array conversion can clobber concurrent appends

Verdict: MITIGATED / CLOSED for local fallback

Evidence:

- `src/lib/audit-log.ts:154` wraps legacy array conversion in `convertLegacyAuditLog`.
- `src/lib/audit-log.ts:159` uses an exclusive local `.lock` file.
- `src/lib/audit-log.ts:165` re-reads current content after lock acquisition before rewriting.

Verification verdict: this mitigates the local legacy-conversion race. Production audit persistence still belongs in database-backed storage when the app leaves local mock mode.

## Ranked Findings

No confirmed cleanup findings remain from the Phase 7 post-cleanup audit.

## Disagreements

- The in-memory/session-keyed rate limiter remains a production-readiness watch item, not a Phase 7 cleanup finding, because live Smithii execution, auth/user identity, and Upstash infrastructure are not currently wired.
- Expired-plan one-shot consumption remains a design choice. It is not user-visible as success and is already reported as `410`/expired.

## Design Choices

- Local `.smithii-local` plan and audit persistence remains acceptable for mock-first phases.
- The backend still must not receive or log private keys. The new `private_key_rejected` audit event is payload-free and does not include rejected field names or values.
- Live Smithii execution remains intentionally blocked until Smithii provides the browser-side transaction assembly integration and the missing contract answers.

## Dead Code

No dead code findings were identified in the focused post-cleanup scope.

## Coverage Gaps

- Single-thread fallback only; the originally spawned agents were not recoverable after the CLI was closed.
- No browser/network capture test was run.
- No live Smithii SDK or Smithii backend execution was run, by design.
- Production Upstash/auth-based rate limiting was not implemented or verified because the repo is still local/mock-first.

## Run Stats

- Prior findings checked: 10
- Closed or mitigated: 8
- Design-choice/watch items: 2
- New confirmed cleanup findings: 0
- New partial findings: 0
- New disputed findings: 0
- Researcher roles simulated: 6
- Skeptic roles simulated: 1
- Verification mode: main-thread circular checklist fallback

## Confirmed Cleanup Backlog

No confirmed cleanup backlog remains for this focused Phase 7 follow-up.

SMAC complete - 0 findings (0 confirmed, 0 partial, 0 disputed)

Top 5:
  1. None
  2. None
  3. None
  4. None
  5. None

Next step: run full verification, commit this report, then decide whether to push `main` or start Phase 8 planning around the Smithii-blocked integration questions.
