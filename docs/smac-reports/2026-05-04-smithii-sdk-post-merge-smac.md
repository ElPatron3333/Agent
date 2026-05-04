# Smithii SDK Post-Merge SMAC

Date: 2026-05-04
Mode: general
Coverage: single-thread fallback
Target: merged SDK spike commit 4cc68a3 on main
Question: Audit the merged Smithii SDK spike and report confirmed bugs or cleanup backlog before live integration.

## Run Stats

- Researchers simulated: 6 domain roles plus exactly 1 Skeptic
- Verifiers simulated: circular single-thread verification for each finding
- Usable researcher perspectives: 6
- Usable verifier perspectives: 6
- Findings considered: 5
- Findings confirmed: 2
- Findings partial: 0
- Findings disputed: 0
- Design choices: 3
- Dead code: 0
- Verification commands run during audit:
  - pnpm test tests/unit/smithii-sdk-adapter.test.ts
  - pnpm lint

## Role Design

1. Custody and backend-boundary researcher, conservative
2. SDK contract and external type researcher, exploratory
3. Bundle Launch and Bundle Swap mapping researcher
4. Volume Bot / Anti-MEV mapping researcher
5. Test coverage and regression researcher
6. Dependency and build-surface researcher
7. Skeptic role for false-positive defense

## Ranked Findings

### 1. Anti-MEV randomize is mapped from amount range, but SDK documents direction randomization

- Verdict: CONFIRMED
- Impact: MED
- Confidence: 0.92
- Ranking score: 1.84
- Files: src/lib/smithii/sdk-adapter.ts, tests/unit/smithii-sdk-adapter.test.ts

Evidence:

- File: src/lib/smithii/sdk-adapter.ts:242
- Code:

    config: {
      tokenAddress: input.tokenAddress,
      antiMEVUses: input.makers,
      amount: amountConfigForRange(input.orderAmount),
      delay: delayConfigForRange(input.delaySeconds),
      randomize: input.orderAmount.minSol !== input.orderAmount.maxSol,
    },

- File: node_modules/@smithii/sdk/dist/anti-mev/index.d.ts:31
- Code:

    /** Whether to randomize per-bundle direction (front exposes a toggle). */
    randomize?: boolean;

- File: node_modules/@smithii/sdk/dist/anti-mev/index.cjs:354
- Code:

    if (config.randomize !== void 0) {
      payload.randomize = config.randomize;
    }

- File: tests/unit/smithii-sdk-adapter.test.ts:180
- Code:

    config: {
      tokenAddress: "Mint111",
      antiMEVUses: 200,
      amount: { mode: "random", randomMin: 0.01, randomMax: 0.02 },
      delay: { mode: "random", randomMinDelay: 10, randomMaxDelay: 20 },
      randomize: true,
    },

Description:

The adapter interprets a random SOL amount range as the SDK randomize flag. The SDK contract says randomize controls per-bundle direction, not amount randomization. Amount randomness is already represented by amount.mode = random plus randomMin/randomMax. When live AntiMEVClient.runSingle is wired, this could send an unintended direction-randomization toggle whenever the user chooses random order sizing.

Verifier checks:

- Code match: MATCH. The adapter sets randomize from the order amount range.
- Git intent: Added intentionally in 4cc68a3 as part of the SDK spike.
- Test intent: The current test asserts randomize: true for random order amount, so the test locks in the questionable mapping.
- Reachability: Not wired into live app execution yet; reachable once the adapter becomes the Volume Bot integration boundary.
- Scope safety: Removing or omitting this field affects only the partial Anti-MEV plan and its test expectation.
- Runtime impact: SDK serializes randomize into the backend payload, so the value can affect live Smithii behavior.
- Mode-specific checks: General correctness and external contract check passed.

Recommendation:

Do not set config.randomize from order amount. Omit it unless Smithii confirms a matching MVP field, or add a distinct explicit direction-randomization input later. Update the test to assert the field is absent or undefined for amount-range randomness.

Why this might be wrong:

Smithii may use randomize differently in backend implementation than the published type comment says, but the SDK type and serializer are the best local contract available.

### 2. Bundle Swap adapter passes private keys and amounts through without local non-empty/positive validation

- Verdict: CONFIRMED
- Impact: LOW
- Confidence: 0.84
- Ranking score: 0.84
- Files: src/lib/smithii/sdk-adapter.ts, tests/unit/smithii-sdk-adapter.test.ts

Evidence:

- File: src/lib/smithii/sdk-adapter.ts:172
- Code:

    if (privateKeys.length !== input.participatingWallets.length) {
      throw new Error(
        "Bundle Swap private key count must match participating wallet count.",
      );
    }
    if (amounts.length !== input.participatingWallets.length) {
      throw new Error(
        "Bundle Swap amount count must match participating wallet count.",
      );
    }

- File: src/lib/smithii/sdk-adapter.ts:185
- Code:

    return {
      privKeys: privateKeys,
      amounts,
      mint: publicKeyFromString(target.mintAddress, "Bundle Swap mint"),

- File: node_modules/@smithii/sdk/dist/pump/index.cjs:1327
- Code:

    async bundleSellBuy(args) {
      if (args.privKeys.length === 0) {
        throw new ValidationError("bundleSellBuy: at least one private key required");
      }
      if (args.privKeys.length !== args.amounts.length) {

Description:

The adapter validates only array lengths before returning SDK args. Unlike the launch mapper, it does not reject empty private-key strings. It also does not reject non-finite or non-positive amounts before handing them to the SDK. The SDK does some validation, but the adapter is intended to be the future zero-custody boundary and already has tests for server-side key blocking. Letting malformed secrets or amounts pass through makes failures later, less contextual, and harder to audit.

Verifier checks:

- Code match: MATCH. The adapter checks counts, then returns the original arrays.
- Git intent: Added in 4cc68a3 as a thin mapping spike; no history suggests deliberate acceptance of empty keys or invalid amounts.
- Test intent: Existing tests cover server runtime blocking and count mismatch, but not empty keys, NaN, zero, or negative amounts.
- Reachability: Not wired into live execution yet; reachable as soon as Bundle Swap calls the adapter.
- Scope safety: Adding adapter-side guards preserves valid mappings and fails earlier for invalid ones.
- Runtime impact: Low today because the app remains mock-first; higher once browser SDK execution is wired.
- Mode-specific checks: General error-handling and zero-custody boundary checks passed.

Recommendation:

Add local Bundle Swap adapter validation for non-empty private-key strings and finite positive amounts. Add focused tests for empty key and non-positive/NaN amount rejection.

Why this might be wrong:

The SDK eventually rejects invalid private keys itself, and future callers may derive amounts only from already-validated previews. Still, adapter-level guards are consistent with the launch mapper and safer for the custody boundary.

## Disagreements

None. The skeptic reduced severity for both findings because the adapter is not live-wired yet, but did not dispute the code/contract match.

## Design Choices

### Adapter is not used by the app yet

The new adapter is currently referenced only by tests and docs. That is acceptable for this spike because the branch goal was SDK understanding and typed mapping, not live execution.

### Token-to-token Bundle Swap remains unsupported for SDK execution

The adapter rejects token-to-token swaps for PumpFunClient.bundleSellBuy while the mock app can still preview token-to-token intent. This is a documented limitation, not a current bug.

### Partial peer dependency install is deliberate for Solana-only MVP

The Smithii SDK lists broad peer dependencies, including non-Solana packages. The project installed only the Solana-related peers needed for the current MVP spike. That matches the Pump.fun-only scope and should not be treated as a dependency bug unless future imports require EVM/SUI subpaths.

## Dead Code

No confirmed dead code. The adapter is intentionally unused by runtime app flow during the spike.

## Disputed Findings

No disputed findings survived synthesis.

## Coverage Gaps

- This was a single-thread fallback SMAC run, not true multi-agent coverage.
- No live Smithii API calls were executed.
- No private-key material was tested, by design.
- The audit relied on SDK package typings and distributed JS as the local external contract.
- Dependency-size and bundle-size effects were not measured; the app build succeeded.

## Confirmed Cleanup Backlog

### 1. Correct Anti-MEV randomize mapping

- Category: strong-types
- Exact files in scope:
  - src/lib/smithii/sdk-adapter.ts
  - tests/unit/smithii-sdk-adapter.test.ts
  - docs/smithii-sdk-spike.md if wording needs clarification
- Recommended write owner or work package: SDK adapter owner
- Verification command or check: pnpm test tests/unit/smithii-sdk-adapter.test.ts; pnpm lint; pnpm build
- Dependencies on other findings: none
- Safe to batch with adjacent work: yes, safe to batch with Bundle Swap adapter validation

### 2. Add Bundle Swap adapter preflight validation

- Category: error-handling
- Exact files in scope:
  - src/lib/smithii/sdk-adapter.ts
  - tests/unit/smithii-sdk-adapter.test.ts
- Recommended write owner or work package: SDK adapter owner
- Verification command or check: pnpm test tests/unit/smithii-sdk-adapter.test.ts; pnpm lint; pnpm build
- Dependencies on other findings: none
- Safe to batch with adjacent work: yes, safe to batch with Anti-MEV randomize fix

## Terminal Summary

SMAC complete - 2 findings (2 confirmed, 0 partial, 0 disputed)
Full report: docs/smac-reports/2026-05-04-smithii-sdk-post-merge-smac.md

Top 5:
  1. [MED/92%] Anti-MEV randomize is mapped from amount range, but SDK documents direction randomization
  2. [LOW/84%] Bundle Swap adapter passes private keys and amounts through without local non-empty/positive validation

Next step: use cleanup-orchestrator on the confirmed cleanup backlog, or run a narrower follow-up audit on the top finding.
