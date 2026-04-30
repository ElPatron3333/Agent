# Smithii Agent Phase 3 Branch SMAC

Date: 2026-04-30
Branch: `feature/phase3-bundle-launch`
Mode: `general`
Scope: Phase 3 delta for Bundle Launch conversational prefill, local audit log route/UI, and file-backed pending plan/audit persistence.

## Summary

SMAC found 7 findings: 5 confirmed, 1 partial, 1 design choice. No private-key leakage was confirmed in the Phase 3 delta. The highest priority issues are the unfiltered audit log route, unreliable file-backed read-modify-write persistence, and missing audit records for rejected or expired confirmation attempts.

Research coverage:
- 3 usable domain researchers returned.
- 1 skeptic returned.
- 2 researcher agents timed out and were closed.

Verification coverage:
- 3 verifiers returned after retrying the batch that initially failed due usage limits.
- Local targeted test evidence found one parallel subset failure that supports the shared audit-log write race; the same audit-log route test passed alone.

## Ranked Findings

### 1. CONFIRMED: `/api/audit-log` returns all local sessions

Score: 2.4
Severity: High
Category: security/session isolation

Evidence:
- `src/app/api/audit-log/route.ts:5` defines `GET()` without a `Request`, cookie read, or session lookup.
- `src/app/api/audit-log/route.ts:6` returns `{ records: readAuditLog() }`.
- `src/lib/audit-log.ts:63` reads the full `.smithii-local/audit-log.json` array.
- `src/components/smithii-agent-app.tsx:95` fetches `/api/audit-log` directly from the client.
- `tests/unit/audit-log-route.test.ts:32` filters by `sessionId` after receiving the API response, which means the route already returned records from outside that test session.

Impact:
Any browser session that can reach the route can read other local sessions' `sessionId`, `tool`, `planId`, `outcome`, and timestamps. The records intentionally exclude `privateKey` and pending-plan `signature`, but the endpoint still violates per-session audit drawer expectations once this is more than a single local operator.

Skeptic check:
The skeptic correctly classified broad local audit visibility as plausible for the mock/local phase. That reduces severity for local-only development, but does not make the unfiltered route safe to carry into a multi-user preview or production environment.

Recommendation:
Change `GET(request: Request)` to read the `smithii_agent_session` cookie and return only records for that session. Add a two-session regression test proving session A cannot see session B.

### 2. CONFIRMED: file-backed read-modify-write can lose audit and plan records

Score: 2.4
Severity: High
Category: persistence correctness

Evidence:
- `src/lib/audit-log.ts:60` appends with `writeAuditLog([...readAuditLog(), record])`.
- `src/lib/audit-log.ts:83` rewrites the full audit JSON file.
- `src/app/api/chat/route.ts:436` writes plan records by spreading `readPlanRecords()` into a new object.
- `src/app/api/chat/route.ts:416` and `src/app/api/chat/route.ts:423` read and rewrite plan state during consume.
- A targeted parallel Vitest subset failed once with only one of two expected audit records present; `pnpm vitest run tests/unit/audit-log-route.test.ts` passed when run alone.

Impact:
Concurrent route calls can drop audit events, pending plans, or consumed statuses. This undermines both the audit log and replay protection.

Skeptic check:
`.smithii-local` is valid as a local mock store, but the current implementation still needs reliable local semantics if tests and local sessions run in parallel.

Recommendation:
Use append-only JSONL or a process-local write queue for audit records. For plan records, use an atomic claim/write path. Before real execution, move plan and audit persistence to Supabase/Redis or an equivalent transactional store.

### 3. CONFIRMED: rejected and expired confirmation attempts are not audited

Score: 2.0
Severity: Medium
Category: audit completeness

Evidence:
- `src/app/api/chat/route.ts:79` parses pending plans before any audit append.
- `src/app/api/chat/route.ts:80` returns `400 Invalid pending plan` before writing an audit record.
- `src/lib/agent/mock-chat.ts:201` returns `Preview expired` for stale pending plans.
- `src/lib/audit-log.ts:40` only records consumed plans when `isExecutionOutcome(result.executionStatus)` is true.
- `src/lib/audit-log.ts:75` does not classify `Preview expired` as auditable.

Impact:
Forged plans, replay attempts, unknown tools, no-cookie confirms, and expired confirms are currently invisible in the audit trail. The strongest immediate gap is expired signed confirms, because those are valid confirmation-gate outcomes rather than malformed input noise.

Skeptic check:
Malformed requests can be noisy and injection-prone if logged carelessly. The fix should log only safe metadata and outcome names, never raw request bodies.

Recommendation:
Expand audit event types to include rejected/expired confirmation attempts. Log only session ID, safe plan/tool identifiers when parseable, event type, and outcome.

### 4. CONFIRMED: malformed local persistence can be erased or crash later

Score: 1.6
Severity: Medium
Category: error handling

Evidence:
- `src/lib/audit-log.ts:68` parses audit JSON and casts directly to `AuditLogRecord[]`.
- `src/lib/audit-log.ts:70` returns `[]` on parse error.
- `src/lib/audit-log.ts:60` can then overwrite the old unreadable audit file with only the new record.
- `src/app/api/chat/route.ts:448` parses plan records and casts directly to `Record<string, PlanRecord>`.
- `src/app/api/chat/route.ts:453` returns `{}` on parse error.
- Structurally valid but wrong-shaped JSON is not validated before later indexing/spreading.

Impact:
An interrupted write or manual local edit can silently erase audit history on the next append, or crash the route when a syntactically valid file has the wrong shape.

Recommendation:
Validate parsed JSON shapes. Quarantine corrupt local files before resetting them. Fail closed for pending-plan confirmation when plan storage is malformed.

### 5. CONFIRMED: Phase 3 DoD phrase lacks full preview reachability coverage

Score: 1.4
Severity: Medium
Category: test coverage

Evidence:
- `PLAN.md:352` requires a user to chat `launch a token called X with a 5-wallet bundle` and reach a preview card, confirm, mock mint, and audit log.
- `tests/unit/mock-agent.test.ts:24` uses the matching phrase but only asserts draft prefill.
- `tests/unit/mock-agent.test.ts:43` covers preview reachability through a separate manual collection flow.
- `tests/unit/chat-route.test.ts:99`, `:236`, and `:283` cover preview, confirm, and audit with prebuilt draft objects.

Impact:
A regression could keep initial prefill passing while losing the prefilled wallet count before preview, and current tests would not catch the exact DoD workflow.

Recommendation:
Add an end-to-end unit route test that starts with `launch a token called Blue Frog with a 5-wallet bundle`, continues through remaining fields, confirms, and asserts five bundle wallets plus audit records.

### 6. CONFIRMED: token-name parser truncates valid names containing delimiter words

Score: 1.0
Severity: Low
Category: parser correctness

Evidence:
- `src/lib/agent/mock-chat.ts:516` stops token-name capture on any bare `with`, `using`, or `for`.
- This correctly handles `Blue Frog with a 5-wallet bundle`.
- It mis-parses names such as `Built With Love`, `Made using AI`, and `Tokens for Friends` by truncating at the delimiter word.

Impact:
The user is immediately asked for a symbol after the bad name is prefilled, so the wrong token name can carry forward into preview unless manually noticed.

Recommendation:
Make delimiters clause-specific, for example only stop on `with a/an/<number> ... wallet` or similar known configuration clauses.

### 7. PARTIAL: concurrent confirms can execute the same plan in parallel workers

Score: 0.9
Severity: Medium
Category: execution idempotency

Evidence:
- `src/app/api/chat/route.ts:79` accepts a pending record before execution.
- `src/app/api/chat/route.ts:109` executes `handleMockChat`.
- `src/app/api/chat/route.ts:123` consumes the pending plan only after execution.
- `src/lib/agent/mock-chat.ts:214` executes the launch branch when a valid confirm reaches it.

Verifier caveat:
In a single Node event loop, after `request.json()` resolves there is no `await` between validation and consume, so same-process requests are likely serialized. The risk is real for multi-process, multi-worker, or production persistence because check and consume are not atomic.

Recommendation:
Before real Smithii execution, atomically claim the plan before executing it. Use conditional update semantics in the real persistence layer.

## Design Choices

- Mock-first/local-first execution is aligned with `README.md`, `AGENTS.md`, and `PLAN.md`.
- `.smithii-local` file persistence is acceptable for local mock state, but should not be treated as production-ready persistence.
- Internal camelCase DTOs are acceptable before the Smithii adapter boundary exists.
- Deterministic mock plan IDs and mock signatures are acceptable in the current mock layer.
- Nested worktree build warnings are environment noise unless reproduced outside the linked worktree.
- Branch not merged into `origin/main` is process state, not a code defect.

## Disputed Findings

No findings were fully disputed after verification.

## Coverage Gaps

- Two original researcher agents timed out before returning.
- Verification initially failed due usage limits, then succeeded after retry.
- No browser/E2E test exists for the full Phase 3 chat-to-preview-to-confirm workflow.
- No concurrent writer test exists for audit or plan local persistence.
- No malformed `.smithii-local` file tests exist.

## Run Stats

- Domain researchers dispatched: 5
- Domain researchers usable: 3
- Skeptics dispatched: 1
- Skeptics usable: 1
- Verifiers dispatched after retry: 3
- Verifiers usable: 3
- Confirmed findings: 5
- Partial findings: 1
- Design choices: 1
- Disputed findings: 0

## Confirmed Cleanup Backlog

### 1. Session-scope audit log reads

Category: strong-types
Files in scope:
- `src/app/api/audit-log/route.ts`
- `src/lib/audit-log.ts`
- `tests/unit/audit-log-route.test.ts`

Recommended owner:
Route/API owner.

Verification:
Run `pnpm vitest run tests/unit/audit-log-route.test.ts` and a full `pnpm test`.

Dependencies:
None.

Batch safety:
Safe to batch with audit event type changes.

### 2. Make local audit and plan persistence reliable

Category: error-handling
Files in scope:
- `src/lib/audit-log.ts`
- `src/app/api/chat/route.ts`
- `tests/unit/chat-route.test.ts`
- `tests/unit/audit-log-route.test.ts`

Recommended owner:
Persistence/route owner.

Verification:
Add concurrent append/claim tests, malformed file tests, then run `pnpm test`.

Dependencies:
None for local reliability. Production-grade store migration can remain a later phase.

Batch safety:
Safe to batch with malformed-file validation. Do not mix with broad Supabase migration unless that is the explicit next phase.

### 3. Audit rejected and expired confirmation attempts

Category: error-handling
Files in scope:
- `src/lib/audit-log-types.ts`
- `src/lib/audit-log.ts`
- `src/app/api/chat/route.ts`
- `src/components/smithii-agent-app.tsx`
- `tests/unit/chat-route.test.ts`

Recommended owner:
Audit/event contract owner.

Verification:
Add tests for forged/no-cookie/replayed/expired pending plans producing safe audit records, then run `pnpm test`.

Dependencies:
Coordinate with session-scoped audit reads so new records are visible only to the current session.

Batch safety:
Safe to batch with session-scoped audit reads.

### 4. Add full Phase 3 DoD workflow coverage

Category: comment-slop
Files in scope:
- `tests/unit/mock-agent.test.ts`
- `tests/unit/chat-route.test.ts`

Recommended owner:
Test owner.

Verification:
Run `pnpm vitest run tests/unit/mock-agent.test.ts tests/unit/chat-route.test.ts`.

Dependencies:
None.

Batch safety:
Safe to batch with parser fix.

### 5. Tighten launch intent delimiter parsing

Category: error-handling
Files in scope:
- `src/lib/agent/mock-chat.ts`
- `tests/unit/mock-agent.test.ts`

Recommended owner:
Agent parser owner.

Verification:
Add tests for `Blue Frog with a 5-wallet bundle`, `Built With Love`, and `Tokens for Friends`, then run `pnpm vitest run tests/unit/mock-agent.test.ts`.

Dependencies:
None.

Batch safety:
Safe to batch with DoD workflow coverage.
