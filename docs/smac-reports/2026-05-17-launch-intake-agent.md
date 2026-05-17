# SMAC Report: Structured Bundle Launch Intake Agent

- Date: 2026-05-17
- Mode: cleanup with correctness checks at intake boundaries
- Scope: latest structured Bundle Launch intake implementation and adjacent route/UI/browser handoff wiring
- Coverage: single-thread fallback with role-separated research, one Skeptic pass, and main-thread verification synthesis

## Roles

- Parser/state correctness researcher
- Wallet identity and allocation researcher
- Route/security boundary researcher
- UI/browser handoff researcher
- Type/contracts researcher
- Tests/regression coverage researcher
- Skeptic: false-positive and design-intent defense

## Ranked Findings

### 1. Missing-field prompts can dead-end because direct replies are not collected

- Verdict: CONFIRMED
- Impact: HIGH
- Confidence: 0.90
- Ranking score: 2.70
- Files: `src/lib/agent/launch-intake.ts`, `tests/unit/launch-intake.test.ts`
- Evidence: `nextPrompt` asks direct scalar questions for missing fields at `src/lib/agent/launch-intake.ts:233`, `src/lib/agent/launch-intake.ts:237`, `src/lib/agent/launch-intake.ts:240`, `src/lib/agent/launch-intake.ts:243`, `src/lib/agent/launch-intake.ts:246`, and `src/lib/agent/launch-intake.ts:249`, but `mergeMessageIntoDraft` only fills those fields through patterned natural-language parsing at `src/lib/agent/launch-intake.ts:175`, `src/lib/agent/launch-intake.ts:176`, `src/lib/agent/launch-intake.ts:177`, `src/lib/agent/launch-intake.ts:178`, and `src/lib/agent/launch-intake.ts:180`.
- Description: If the agent asks `What token name should I use?`, a natural direct reply like `Shitcoin` does not set `tokenName`, so the next response repeats the same prompt. The same failure mode applies to plain symbol, description, dev wallet, dev amount, and bundle count answers.
- Test intent: current tests cover one-message complete intake and initial missing prompts, but do not continue a `launch_intake` draft with direct answers.
- Recommendation: Add regression tests for continuing an intake draft from direct prompt answers, then add minimal prompt-context fallback parsing in `advanceLaunchIntake`.
- Why this might be wrong: A product could require every answer to restate the full field label, but the prompts are written as one-at-a-time questions and the spec says the agent should ask for missing data.

### 2. Duplicate bundle buyers can pass readiness when the same wallet is referenced by index and pubkey

- Verdict: CONFIRMED
- Impact: HIGH
- Confidence: 0.88
- Ranking score: 2.64
- Files: `src/lib/agent/launch-intake.ts`, `src/lib/smithii/bundle-launch-browser-wiring.ts`, `tests/unit/launch-intake.test.ts`
- Evidence: `upsertAllocation` de-duplicates only by literal reference key at `src/lib/agent/launch-intake.ts:467` and `src/lib/agent/launch-intake.ts:481`, while preview readiness checks allocation count, not unique resolved pubkeys, at `src/lib/agent/launch-intake.ts:101` and `src/lib/agent/launch-intake.ts:109`. The only duplicate validation checks dev-vs-bundle at `src/lib/agent/launch-intake.ts:258`. Browser handoff later turns every preview wallet into a buyer signer at `src/lib/smithii/bundle-launch-browser-wiring.ts:92`.
- Description: A message can provide `Wallet 2 buys ...` and `BuyerPubkey222 buys ...`; after resolution those are the same imported wallet but can count as two bundle allocations and produce two buyer entries.
- Test intent: no regression test asserts unique resolved bundle wallet identities.
- Recommendation: Validate duplicate resolved bundle pubkeys before readiness and block with a narrow replacement prompt.
- Why this might be wrong: A platform could theoretically allow multiple buys from one signer, but the spec requires exact bundle wallet identities and the wallet table mapping implies one allocation per imported wallet.

### 3. Missing-buy prompts can point to the dev wallet or to no available wallet

- Verdict: CONFIRMED
- Impact: MED
- Confidence: 0.86
- Ranking score: 1.72
- Files: `src/lib/agent/launch-intake.ts`, `tests/unit/launch-intake.test.ts`
- Evidence: `nextMissingWalletIndexes` excludes the dev wallet only when the dev was referenced by index at `src/lib/agent/launch-intake.ts:427`, then builds candidates from every imported row at `src/lib/agent/launch-intake.ts:437`. `missingBundleBuyPrompt` slices those candidates without checking whether enough imported non-dev wallets exist at `src/lib/agent/launch-intake.ts:414`.
- Description: If the dev wallet was supplied as an exact pubkey, the next missing-buy prompt may ask for `wallet 1` even though row 1 is the dev wallet. If the requested bundle count exceeds available non-dev rows, the prompt can run out of candidate indexes and become non-actionable.
- Test intent: current tests cover an unknown explicit index, but not exact-pubkey dev exclusion or requested count greater than available non-dev rows.
- Recommendation: Build missing candidates by resolved pubkey, exclude the resolved dev row regardless of reference kind, and emit an import-more-wallets prompt when no safe candidate remains.
- Why this might be wrong: Users can still provide exact imported public keys for missing buyers, but the current prompt explicitly asks for table indexes, so it should not suggest impossible or dev rows.

## Disagreements

- None of the verified findings were disputed after re-reading the cited code and nearby tests.

## Design Choices

- Legacy `bundle_launch` previews still carry `devAmountSol: 0` from mock fee math at `src/lib/agent/mock-chat.ts:1069`; this preserves prior behavior and is not a structured-intake regression.
- The route parser accepts and then re-resolves `resolvedPubkey` hints on `launch_intake` drafts. Because `advanceLaunchIntake` calls `resolveDraftWallets` before readiness, stale client-provided resolved values are not trusted for preview conversion.
- UI source-string tests are weak coverage, but this repo already uses them for browser-only wiring checks; keep them as boundary smoke tests, not as sole validation for intake behavior.

## Dead Code

- No high-confidence dead code found in the scoped implementation.

## Disputed Findings

- Parser coverage for `coin X`, `token X`, and `wallet:<pubkey>` forms is narrower than the full spec. This is a feature-completeness gap, but it was not promoted into the cleanup backlog because the current cleanup pass is focused on invalid or dead-ended paths in implemented behavior.

## Coverage Gaps

- No browser screenshot or Playwright pass was run for this audit; the scoped findings are pure state-machine and boundary issues.
- No delegated multi-agent verification was used; this report is labeled single-thread fallback.

## Run Stats

- Usable domain researchers: 6
- Skeptic roles: 1
- Verifiers: 1 main-thread verification synthesis
- Findings total: 3
- Confirmed: 3
- Partial: 0
- Disputed: 0
- Design choices: 3
- Dead code: 0

## Confirmed Cleanup Backlog

### Harden launch intake continuation and wallet identity validation

- Category: error-handling
- Exact files in scope: `src/lib/agent/launch-intake.ts`, `tests/unit/launch-intake.test.ts`
- Recommended write owner: launch intake state-machine package
- Objective: Make missing-field prompts actionable and prevent invalid duplicate or impossible bundle wallet allocations from becoming ready previews.
- Recommended changes: add regression tests for direct prompt replies, duplicate resolved buyer wallets, exact-pubkey dev exclusion from missing-buy prompts, and requested bundle count exceeding available imported buyer rows; then implement minimal intake-state parsing and validation to pass those tests.
- Verification command: `pnpm vitest run tests/unit/launch-intake.test.ts`
- Dependencies: none
- Safe to batch with adjacent work: yes, because all confirmed findings share the same pure module and test file.
