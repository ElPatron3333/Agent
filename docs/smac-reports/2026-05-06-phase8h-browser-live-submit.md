# SMAC Report: Phase 8H Browser Live Submit

Date: 2026-05-06
Branch: feature/phase8h-browser-live-submit
Mode: general
Coverage: single-thread fallback. Sub-agent delegation was not used because this turn did not explicitly authorize delegated/parallel agent work.
Question: Audit Phase 8H browser wallet signer, browser live-submit helper, UI wiring, tests, and import boundaries.

## Run Stats

- Scout inputs: `git log --oneline -30`, Phase 8H design and implementation plan, Phase 8H source/tests, Phase 8D/8F/8G browser handoff code, prior SMAC learnings.
- Research roles simulated: wallet identity/security, secret redaction, UI readiness/error handling, SDK boundary/import layering, tests/coverage, conservative implementation fit, Skeptic.
- Verifier coverage: single-thread circular simulation; every confirmed finding was re-read at cited lines and checked against tests and design docs.
- Verification before audit: targeted Phase 8H tests passed, full `pnpm test` passed, `pnpm exec tsc --noEmit` passed, `pnpm lint` passed, `pnpm build` passed, `git diff --check` passed, and `rg -n "pump-browser-executor" src/app src/components` had no matches.

## Ranked Findings

### 1. Connected signer is not required to match the browser execution plan wallet

- Impact: HIGH
- Confidence: 0.92
- Verdict: CONFIRMED
- Category: error-handling / strong-types
- Files: `src/lib/smithii/browser-live-submit.ts`, `src/components/smithii-agent-app.tsx`, `tests/unit/smithii-browser-live-submit.test.ts`
- Evidence:
  - `src/lib/smithii/browser-live-submit.ts:61`-`83` checks packet, signer presence, approval, and config, but does not compare `signer.publicKey` to `packet.executorInput.plan.wallet`.
  - `src/lib/smithii/browser-live-submit.ts:100`-`105` creates the Smithii client with the connected signer.
  - `src/lib/smithii/browser-live-submit.ts:107`-`123` executes the packet without wallet identity validation.
  - `src/lib/smithii/bundle-launch-browser-wiring.ts:111`-`114` records the plan wallet as `preview.devWalletPubkey`.
  - `src/components/smithii-agent-app.tsx:581`-`586` passes the connected signer to live submit for Bundle Launch after preparing a packet from the preview state.
  - `tests/unit/smithii-browser-live-submit.test.ts:148`-`151` and `191`-`196` only cover the matching-wallet happy path (`Wallet111`).
- Runtime impact: A user can prepare/approve a plan for one dev/fee wallet but submit with a different connected browser signer. Smithii execution would use the connected signer while the plan/result metadata still reports the prepared wallet/idempotency context, which can make the launch/swap execute under a wallet the plan did not approve.
- Why this might be wrong: The UI shows the connected wallet and Bundle Swap re-prepares with the connected wallet at submit time, so some flows reduce mismatch risk. This does not cover Bundle Launch and does not protect the reusable live-submit helper.

### 2. Live submit can return/render sensitive values embedded in error messages

- Impact: MED
- Confidence: 0.86
- Verdict: CONFIRMED
- Category: error-handling
- Files: `src/lib/smithii/browser-live-submit.ts`, `src/lib/smithii/pump-browser-executor.ts`, `src/components/smithii-agent-app.tsx`, `tests/unit/smithii-browser-live-submit.test.ts`
- Evidence:
  - `src/lib/smithii/pump-browser-executor.ts:145` and `153`-`159` copy `error.message` or thrown string into the normalized error result.
  - `src/lib/smithii/browser-live-submit.ts:124`-`128` returns that normalized error from the live-submit helper.
  - `src/components/smithii-agent-app.tsx:1631`-`1634` renders `submitResult.error.message` directly.
  - `tests/unit/smithii-browser-live-submit.test.ts:118`-`145` verifies body redaction, but the error message is a safe string (`bundle exploded`), so it does not prove message-level redaction.
  - Phase 8H design requires no private key values, private-key-shaped labels, metadata body text, or raw SDK bodies in rendered submit status (`docs/superpowers/specs/2026-05-06-phase8h-browser-live-submit-design.md:78`-`112`).
- Runtime impact: If an SDK/client error message or thrown string includes a buyer `pk`, `privKeys`, metadata description, or another known browser-held sensitive value, the helper can return it and the UI can render it.
- Why this might be wrong: Well-behaved SDK errors should not include caller private keys. The repo still needs to guard this boundary because Phase 8H explicitly promises sanitized submit errors and handles unknown SDK errors.

### 3. Submit button readiness does not pre-check runtime public config

- Impact: LOW
- Confidence: 0.64
- Verdict: PARTIAL
- Category: error-handling
- Files: `src/components/smithii-agent-app.tsx`, `src/lib/smithii/browser-live-submit.ts`
- Evidence:
  - Design lists runtime public config as a required UI gate (`docs/superpowers/specs/2026-05-06-phase8h-browser-live-submit-design.md:65`-`70`).
  - `src/components/smithii-agent-app.tsx:1469`-`1478` enables submit based on prepared packet, connected wallet, approval, and pending state only.
  - `src/lib/smithii/browser-live-submit.ts:77`-`81` still blocks invalid config before client creation.
- Runtime impact: With missing `NEXT_PUBLIC_*` config, the button can enable and then immediately show a blocked result after click. This is a UX/readiness mismatch, not a safety issue, because the helper blocks before Smithii client creation.
- Why this might be wrong: The actual safety gate exists in the helper and users still receive a blocked reason. Treat as follow-up UX polish unless broader cleanup is already touching readiness display.

## Disagreements / False-Positive Filters

- Shared browser modules under `src/lib/smithii` are not backend live-execution defects by themselves. Import search found no `pump-browser-executor` import under `src/app` or `src/components`, and the branch intentionally keeps backend execution out of scope.
- Lack of real mainnet execution is not a defect in automated tests; the design explicitly excludes mainnet/sandbox transaction runs.
- The small injected-provider adapter is a design choice for Phase 8H, not a dependency gap; a full wallet-adapter integration is listed as a residual watch item.

## Design Choices

- Backend execution routes, server-issued durable plan records, production auth/billing/rate limiting, Volume Bot live execution, token-to-token Bundle Swap, and mainnet automated tests remain explicitly out of scope for Phase 8H.
- Bundle Swap re-prepares on submit with the connected signer as fee wallet; this is acceptable, but the common helper should still validate signer identity against the final packet plan.

## Dead Code

No dead code findings confirmed.

## Coverage Gaps

- Single-thread fallback means no independent sub-agent verification coverage.
- No browser E2E wallet-provider simulation was run; existing app coverage is static source guards plus helper/unit tests.
- No real Smithii transaction was executed, by design.

## Confirmed Cleanup Backlog

### 1. Enforce signer/public plan wallet match before live submit

- Category: error-handling
- Exact files in scope:
  - `src/lib/smithii/browser-live-submit.ts`
  - `tests/unit/smithii-browser-live-submit.test.ts`
- Recommended write owner/work package: live-submit helper owner.
- Verification command or check:
  - `pnpm vitest run tests/unit/smithii-browser-live-submit.test.ts`
  - `pnpm exec tsc --noEmit`
- Dependencies: none.
- Safe to batch with adjacent work: yes, safe to batch with error-message redaction because both are live-submit helper guards.

### 2. Redact known sensitive packet values and private-key-shaped labels from live-submit errors

- Category: error-handling
- Exact files in scope:
  - `src/lib/smithii/browser-live-submit.ts`
  - `tests/unit/smithii-browser-live-submit.test.ts`
- Recommended write owner/work package: live-submit helper owner.
- Verification command or check:
  - `pnpm vitest run tests/unit/smithii-browser-live-submit.test.ts`
  - `pnpm exec tsc --noEmit`
- Dependencies: none.
- Safe to batch with adjacent work: yes, safe to batch with signer/plan wallet validation.


## Cleanup-Orchestrator Result

Package complete: live-submit error boundary
Files changed: `src/lib/smithii/browser-live-submit.ts`, `tests/unit/smithii-browser-live-submit.test.ts`
Verification: `pnpm vitest run tests/unit/smithii-browser-live-submit.test.ts` -> 9 passed; targeted Phase 8H tests -> 48 passed; `pnpm exec tsc --noEmit` -> passed; `pnpm test` -> 222 passed; `pnpm lint` -> passed; `pnpm build` -> passed; `git diff --check` -> passed.

Deferred:
- Submit button config pre-check remains a low-impact UX/readiness follow-up because helper-level config validation already blocks before client creation.

Residual risk:
- Error redaction covers known packet secret values and private-key-shaped labels. It cannot redact arbitrary transformed/truncated secrets that an external SDK might invent in an error message.

## Terminal Summary

SMAC complete - 3 findings (2 confirmed, 1 partial, 0 disputed)
Full report: docs/smac-reports/2026-05-06-phase8h-browser-live-submit.md

Top 5:
  1. [HIGH/92%] Connected signer is not required to match the browser execution plan wallet
  2. [MED/86%] Live submit can return/render sensitive values embedded in error messages
  3. [LOW/64%] Submit button readiness does not pre-check runtime public config

Next step: use cleanup-orchestrator on the confirmed cleanup backlog.