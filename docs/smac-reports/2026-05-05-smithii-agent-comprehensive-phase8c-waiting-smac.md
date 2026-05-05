# SMAC Report: Comprehensive Phase 8C Waiting Checkpoint

Date: 2026-05-05  
Branch: main  
Mode: general  
Coverage: single-thread fallback. No subagents were used, so this report does not claim multi-agent coverage.

Scope: current `main` after Phase 7 safety, Phase 8A live boundary, Phase 8B question packet, and Phase 8C readiness/runbook/test work. Live Smithii execution remains intentionally disabled while waiting for Smithii.

## Ranked Findings

### 1. [MED / 90%] Volume Bot `randomize` blocker is missing from some Smithii metadata surfaces

Evidence: `docs/phase8c-readiness-matrix.md:85` treats `AntiMEVSingleConfig.randomize` semantics as a required Volume Bot answer. `src/lib/smithii/live-boundary.ts:23` defines the randomize question, `src/lib/smithii/live-boundary.ts:121` includes it for Volume Bot, and `tests/unit/smithii-live-boundary.test.ts:66` pins it. But `src/lib/smithii/sdk-adapter.ts:260` returns only three `questionsForSmithii` from `toAntiMevSinglePlan`, omitting randomize; `tests/unit/smithii-sdk-adapter.test.ts:219` locks that length at three; `docs/smithii-sdk-spike.md:73` lists only the older three Volume Bot gate questions. `docs/phase8c-test-coverage-audit.md:60` is also stale because it says live-boundary questions do not mention randomize, while the same doc later says the boundary question was added.

Verification: code match confirmed. Git history shows `64e8aea` added the live-boundary randomize blocker, while the older SDK adapter/spike surfaces from `4cc68a3` were not updated. This is not a live execution path and does not create a key leak, but future Phase 8C wiring could use the adapter/spike metadata and miss an already-known blocker.

Why this might be wrong: the canonical CEO-facing packet already asks the randomize question at `docs/smithii-integration-questions.md:46`. That lowers external handoff risk, but does not remove the internal metadata drift.

Recommended fix: add the same randomize question to the SDK adapter Volume Bot plan metadata, update the adapter test to assert the question explicitly, and refresh the stale spike/coverage-audit wording.

### 2. [LOW / 85%] Phase 8C answer status vocabulary diverges between matrix and runbook

Evidence: `docs/phase8c-readiness-matrix.md:33` says status values are `unanswered`, `answered`, `partial`, `blocked`, and `needs meeting`. `docs/phase8c-answer-intake-runbook.md:23` defines the status values without `unanswered`, and uses `not received` at `docs/phase8c-answer-intake-runbook.md:31`; the template also uses `not received` at `docs/phase8c-answer-intake-runbook.md:47`.

Verification: code match confirmed. Git history shows the matrix came from `0eb15a3` and the runbook from `63d4810`. `tests/unit/phase8c-readiness-doc.test.ts:13` guards major gate terms, but not status vocabulary consistency. Runtime impact is none; this only affects answer intake when Smithii replies.

Why this might be wrong: `unanswered` and `not received` are plain-English synonyms. The issue is operational consistency, not meaning.

Recommended fix: choose one missing-answer status, preferably `not received` because the runbook template already uses it, and align the readiness matrix plus any lightweight doc guard.

## Disagreements

- Exact SDK private-key argument names inside `src/lib/smithii/sdk-adapter.ts` and `docs/smithii-sdk-spike.md` are not public response leaks. `/api/chat` live-boundary metadata uses neutral signer-material labels, and route tests reject private-key alias fields.
- Local HMAC pending plans and `.smithii-local` persistence are acceptable for this mock-first waiting state. They remain a live-readiness watch item, not a cleanup finding today.
- `browser-handoff-ready` is not a live-ready claim in this repo; it means a known SDK target exists while backend execution remains blocked.

## Design Choices

- Browser wallet roster entries keep `privateKey` client-side for mock import/export. Backend request builders send public selections only, and `/api/chat` rejects private-key-shaped request fields before parsing.
- Volume Bot and Launch + Volume remain blocked until Smithii answers the product mapping, zero-custody model, fees/funds, lifecycle, edit, and sequencing questions.

## Dead Code

No dead code findings were confirmed.

## Disputed Findings

No backend private-key custody leak, live execution enablement, or preview-confirm bypass was confirmed. Current tests cover alias rejection, audit sanitization, one-shot pending plans, stale/invalid plans, mock-only confirmations, and no-live-result assertions.

## Coverage Gaps

- Single-thread fallback only.
- No Playwright/browser network-capture pen-test.
- No live Smithii SDK, sandbox, or low-amount mainnet call by design.
- Review focused on Phase 7 through Phase 8C surfaces, not a full historical audit of every old SMAC report.

## Run Stats

- Simulated roles: zero-custody boundary, preview/confirm lifecycle, Smithii SDK metadata, Phase 8C docs/runbook, test coverage, production-readiness watch, Skeptic.
- Candidates considered: 7.
- Confirmed findings: 2.
- Confirmed cleanup backlog items: 2.
- Coverage label: single-thread fallback.

## Confirmed Cleanup Backlog

### 1. Align Volume Bot randomize metadata surfaces

- Category: comment-slop
- Files in scope: `src/lib/smithii/sdk-adapter.ts`, `tests/unit/smithii-sdk-adapter.test.ts`, `docs/smithii-sdk-spike.md`, `docs/phase8c-test-coverage-audit.md`
- Owner/work package: Smithii SDK adapter metadata and Phase 8C docs consistency
- Verification: `pnpm test tests/unit/smithii-sdk-adapter.test.ts tests/unit/smithii-live-boundary.test.ts`, then `pnpm lint`, `pnpm build`, `git diff --check`
- Dependencies: none
- Safe to batch: yes

### 2. Align Phase 8C missing-answer status vocabulary

- Category: comment-slop
- Files in scope: `docs/phase8c-readiness-matrix.md`, `docs/phase8c-answer-intake-runbook.md`, optionally `tests/unit/phase8c-readiness-doc.test.ts`
- Owner/work package: Phase 8C answer-intake docs
- Verification: `pnpm test tests/unit/phase8c-readiness-doc.test.ts`, then `pnpm lint`, `pnpm build`, `git diff --check`
- Dependencies: none
- Safe to batch: yes

## Terminal Summary

- `pnpm test`: passed, 13 files / 139 tests.
- `pnpm lint`: passed.
- `pnpm build`: passed.
- `git diff --check`: passed before report creation.

SMAC complete: 2 confirmed findings, both docs/metadata consistency cleanup items.
