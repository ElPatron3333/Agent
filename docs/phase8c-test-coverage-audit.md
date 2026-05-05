# Phase 8C Test Coverage Audit

Date: 2026-05-05
Scope: current test suite coverage against `docs/phase8c-readiness-matrix.md`
Status: audit complete; Step 2 regression tests implemented

## Summary

The current test suite already covers the core mock-first safety model: backend private-key rejection, signed pending plans, single-use confirmation, live-boundary blocking, and mock-only execution responses.

The main gap is consistency. Several Phase 8C invariants are covered for one or two flows, but not as a focused regression set across Bundle Launch, Bundle Swap, Volume Bot, and Launch + Volume. Step 2 should add targeted tests that lock those invariants before any Smithii live wiring begins.

## Existing Coverage

| Readiness gate | Current coverage | Evidence |
|---|---|---|
| Backend rejects private-key-shaped request fields | Covered at route level, including nested alias names. | `tests/unit/chat-route.test.ts:93`, `tests/unit/chat-route.test.ts:1046`; implementation at `src/app/api/chat/route.ts:65`, `src/app/api/chat/route.ts:102`, `src/app/api/chat/route.ts:1119`. |
| Backend responses avoid private-key alias fields | Covered for major preview/confirm responses with `expectNoPrivateKeyAliasFields`. | `tests/unit/chat-route.test.ts:45`, `tests/unit/chat-route.test.ts:160`, `tests/unit/chat-route.test.ts:611`. |
| Audit log strips sensitive fields | Covered for `privateKey` and `signature`; implementation sanitizes all unexpected fields. | `tests/unit/audit-log-route.test.ts:69`, `tests/unit/audit-log-route.test.ts:125`; implementation at `src/lib/audit-log.ts:218`. |
| Pending plans are route-issued and session-bound | Covered for signed plans, missing cookies, forged plans, replay, stale locks, and unknown tools. | `tests/unit/chat-route.test.ts:160`, `tests/unit/chat-route.test.ts:303`, `tests/unit/chat-route.test.ts:997`, `tests/unit/chat-route.test.ts:1261`. |
| Preview-first plus explicit confirm | Covered by no-plan confirmation, confirm-with-draft rejection, non-confirm draft requests, expiry, and one-time confirm tests. | `tests/unit/mock-agent.test.ts:1017`, `tests/unit/chat-route.test.ts:787`, `tests/unit/chat-route.test.ts:943`, `tests/unit/mock-agent.test.ts:1061`. |
| Backend live Smithii execution is blocked | Covered directly in live-boundary tests. | `tests/unit/smithii-live-boundary.test.ts:76`; implementation at `src/lib/smithii/live-boundary.ts:100`. |
| Bundle Launch and SOL/token Bundle Swap are browser-handoff-ready but server-blocked | Covered in live-boundary tests and route previews. | `tests/unit/smithii-live-boundary.test.ts:17`, `tests/unit/smithii-live-boundary.test.ts:28`, `tests/unit/chat-route.test.ts:160`, `tests/unit/chat-route.test.ts:473`. |
| Token-to-token Bundle Swap stays blocked awaiting Smithii | Covered in live-boundary and route preview tests. | `tests/unit/smithii-live-boundary.test.ts:38`, `tests/unit/chat-route.test.ts:517`. |
| Volume Bot and Launch + Volume stay blocked awaiting Smithii | Covered in live-boundary tests and route preview tests. | `tests/unit/smithii-live-boundary.test.ts:53`, `tests/unit/smithii-live-boundary.test.ts:66`, `tests/unit/chat-route.test.ts:611`, `tests/unit/chat-route.test.ts:874`. |
| SDK private-key use is browser-only | Covered in the SDK adapter spike tests. | `tests/unit/smithii-sdk-adapter.test.ts:28`, `tests/unit/smithii-sdk-adapter.test.ts:76`, `tests/unit/smithii-sdk-adapter.test.ts:159`, `tests/unit/smithii-sdk-adapter.test.ts:236`. |
| Volume Bot `randomize` is not mapped by assumption | Partially covered by asserting the current Anti-MEV plan omits `randomize`. | `tests/unit/smithii-sdk-adapter.test.ts:198`, `tests/unit/smithii-sdk-adapter.test.ts:218`; readiness blocker at `docs/phase8c-readiness-matrix.md:83`. |
| Mock execution returns deterministic fake outputs | Covered in mock tool tests and some route/agent tests. | `tests/unit/smithii-tools.test.ts:456`, `tests/unit/mock-agent.test.ts:1012`, `tests/unit/chat-route.test.ts:332`, `tests/unit/chat-route.test.ts:498`, `tests/unit/chat-route.test.ts:920`. |

## Confirmed Test Gaps For Step 2

### GAP-1: Add one focused route-level invariant test covering all Phase 8C flows

Current tests cover the invariants in separate places, but there is no single regression that exercises every flow through `/api/chat` and asserts the Phase 8C safety shape.

Add a route-level test matrix for:

- Bundle Launch
- Bundle Swap SOL/token
- Bundle Swap token-to-token
- Volume Bot
- Launch + Volume

Each case should assert:

- preview response has no private-key alias fields
- `smithiiLive.serverExecution` is `blocked`
- incomplete/unsupported flows are `blocked-awaiting-smithii`
- confirmation, where allowed in mock mode, returns `smithiiLive.mode: mock`
- no response claims real live execution

### GAP-2: Strengthen audit-log poison tests for all private-key alias names

The chat route rejects alias names such as `pk`, `privKeys`, `privateKeys`, `private_key`, `secretKey`, and `seedPhrase` (`tests/unit/chat-route.test.ts:1046`). The audit-log route currently has a poisoned-record test for `privateKey` and `signature` only (`tests/unit/audit-log-route.test.ts:125`).

Add an audit-log route test that stores all private-key alias fields in a local poisoned record and proves the API response strips them all. This is contract-neutral because audit output must never expose those names regardless of Smithii's answer.

### GAP-3: Lock Volume Bot randomize as an unresolved blocker in live metadata

The readiness matrix treats `AntiMEVSingleConfig.randomize` semantics as a Volume Bot blocker (`docs/phase8c-readiness-matrix.md:83`). Current SDK adapter tests only assert that `randomize` is not emitted (`tests/unit/smithii-sdk-adapter.test.ts:218`), and current live-boundary questions do not mention randomize (`src/lib/smithii/live-boundary.ts:119`).

Add a test that Volume Bot live-boundary metadata includes a Smithii question or blocker for `AntiMEVSingleConfig.randomize` semantics. If the test fails, update the boundary metadata; do not map `randomize` to behavior.

### GAP-4: Add explicit no-live-result assertions for mock confirmations

Current route tests check mock execution in several places, but the assertions are not uniform. Add a helper assertion for confirmed mock responses that rejects live-looking claims and requires:

- `smithiiLive.mode` is `mock`
- `smithiiLive.serverExecution` is `blocked`
- generated IDs/signatures are clearly mock-prefixed where present
- no `live`, `mainnet`, `sandbox`, or Smithii success claim appears unless it is part of a documented blocker/status field

Apply it to Bundle Launch, Bundle Swap, Volume Bot, and Launch + Volume route confirmations.

### GAP-5: Add a readiness-doc guard test or lightweight doc check

The readiness matrix is now the source of Phase 8C unlock rules. Add a lightweight test or script check that verifies the doc still contains the key gate terms before live wiring starts:

- zero custody / private keys
- preview / confirm
- idempotency
- result contract
- error contract
- fees and limits
- test path
- unsupported flows remain mocked or blocked

This is not a substitute for code tests, but it prevents accidental deletion of the intake gates while waiting for Smithii.

## Deferred Until Smithii Answers

Do not add tests for exact Smithii API input/output shapes yet. These remain intentionally deferred:

- concrete browser module imports
- real SDK adapter call contracts
- exact auth/license token shape
- real result/error enums
- real route/quote behavior
- sandbox or low-amount mainnet runbook assertions

## Step 2 Test Backlog

Implemented order:

1. Added route-level Phase 8C invariant matrix for all flows.
2. Added audit-log alias poison regression.
3. Added Volume Bot `randomize` blocker regression and updated boundary metadata.
4. Added mock-confirmation no-live-result helper assertions.
5. Added readiness-doc gate preservation check.

## Verification Run During Audit

- Existing suite discovered: 12 unit test files.
- Verification during audit: `git diff --check`, `pnpm test` (12 files, 135 tests), `pnpm lint`, and `pnpm build` all passed.
- Verification after Step 2 implementation: targeted Vitest files passed; `pnpm test` passed with 13 files and 139 tests; `pnpm lint`, `pnpm build`, and `git diff --check` passed.
- The audit itself made no code changes; Step 2 added regression tests and the missing Volume Bot boundary question for `AntiMEVSingleConfig.randomize`.
