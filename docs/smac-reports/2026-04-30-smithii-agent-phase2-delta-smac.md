# SMAC Report: Smithii Agent Phase 2 Delta

Date: 2026-04-30
Mode: general
Scope: recent Phase 2 delta around global settings persistence, wallet roster/import-export, `/api/chat`, preview state, and existing unit coverage.
Coverage: multi-agent research with partial verifier coverage. Five researchers and one Skeptic returned usable output. Three verifiers returned usable output; two verifier agents failed due usage limits.

## Ranked Findings

### 1. Route accepts unnormalized `globalSettings`
- Verdict: CONFIRMED
- Impact: MED
- Confidence: 0.86
- Score: 1.72
- Evidence:
  - `src/app/api/chat/route.ts:95-101` passes `body.globalSettings ?? null` directly to `handleMockChat`.
  - `src/lib/agent/mock-chat.ts:127` only falls back on nullish values.
  - `src/lib/global-settings.ts:27-49` has a normalizer, but the route does not use it.
  - `tests/unit/global-settings.test.ts:41-56` covers malformed stored settings, not malformed API settings.
- Risk: direct `/api/chat` clients can put invalid settings into previews and later execute handoffs.
- Recommendation: normalize at the route boundary with `normalizeGlobalSettings(body.globalSettings)` and add a route test with malformed settings.

### 2. Old preview remains visible while a new launch draft is collected
- Verdict: CONFIRMED
- Impact: MED
- Confidence: 0.88
- Score: 1.76
- Evidence:
  - `src/components/smithii-agent-app.tsx:127-130` preserves the previous `activePreview` when the result has no preview and `shouldClearPreview` is false.
  - `src/lib/agent/mock-chat.ts:151-160` starts a launch draft with `activePreview: null` and `executionStatus: "Collecting launch fields"`.
  - `src/lib/agent/mock-chat.ts:500-510` returns intermediate launch prompts with no preview.
  - `src/components/smithii-agent-app.tsx:73-74` starts with a default preview.
- Risk: the app can show an old/default actionable-looking preview while the chat is collecting a new token.
- Recommendation: clear `activePreview` when `result.draft` is non-null or when execution status is collecting launch fields.

### 3. Invalid pending-plan responses leave stale UI state
- Verdict: CONFIRMED
- Impact: MED
- Confidence: 0.82
- Score: 1.64
- Evidence:
  - `src/components/smithii-agent-app.tsx:119-120` throws on any non-OK response.
  - `src/components/smithii-agent-app.tsx:132-145` only appends a generic error and does not clear `pendingPlan`, `activePreview`, or `executionStatus`.
  - `src/app/api/chat/route.ts:78-82` returns `400` for invalid pending plans.
  - `tests/unit/chat-route.test.ts:119-193` covers missing-session and replay rejections.
- Risk: after session loss, replay, or tampering, the backend rejects the plan while the UI can still display an active-looking preview.
- Recommendation: parse route error bodies and clear pending preview state for `Invalid pending plan.`.

### 4. Incoming `draft` is not runtime-validated at the route boundary
- Verdict: CONFIRMED
- Impact: MED
- Confidence: 0.82
- Score: 1.64
- Evidence:
  - `src/app/api/chat/route.ts:21-27` types the request body but does not validate `draft`.
  - `src/app/api/chat/route.ts:98` forwards `body.draft ?? null`.
  - `src/lib/agent/mock-chat.ts:129-136` trusts `draft?.tool === "bundle_launch"` and passes the draft onward.
  - Route tests cover pending-plan and wallet-selection validation, but not malformed drafts.
- Risk: direct API clients can send malformed draft objects into the mock agent flow.
- Recommendation: add `parseDraft` / `parseBundleLaunchDraft` to mirror existing boundary parsers.

### 5. Launch wallet selection can diverge from collected wallet count over API
- Verdict: CONFIRMED
- Impact: MED
- Confidence: 0.84
- Score: 1.68
- Evidence:
  - `src/app/api/chat/route.ts:163-203` validates wallet selection shape only.
  - `src/lib/agent/mock-chat.ts:519-542` prefers caller-supplied wallet selection over fallback.
  - `src/lib/agent/mock-chat.ts:555-563` echoes the supplied selection into the preview.
  - `src/components/smithii-agent-app.tsx:699-715` is the normal safe UI path, but direct API/corrupt client state can bypass it.
- Risk: a preview can claim a different wallet count or buy amount than the collected draft.
- Recommendation: validate supplied launch selection against complete launch draft fields before preparing the preview.

### 6. Exported demo roster cannot be imported back
- Verdict: CONFIRMED
- Impact: MED
- Confidence: 0.90
- Score: 1.80
- Evidence:
  - `src/lib/wallet-roster.ts:21-68` uses `demo-private-key-*` values.
  - `src/lib/wallet-roster.ts:148-149` exports those values directly.
  - `src/lib/wallet-roster.ts:130-153` imports only base58-shaped private keys.
  - `tests/unit/wallet-roster.test.ts:80-87` locks the demo export string, but no test checks export-to-import round trip.
- Risk: a user can export the default roster from the UI and fail to import the same CSV.
- Recommendation: either use base58-shaped demo private keys or clearly exclude demo wallets from export/import round-trip expectations.

### 7. CSV import only accepts an exact single-column file
- Verdict: CONFIRMED
- Impact: MED
- Confidence: 0.82
- Score: 1.64
- Evidence:
  - `PLAN.md` Phase 2 DoD says import reads a CSV in a `privateKey` column.
  - `src/lib/wallet-roster.ts:121-122` requires the first row to be exactly `privateKey` and a single column.
  - Tests cover single-column success and missing-header failure only.
- Risk: normal CSVs with a `privateKey` column plus extra metadata columns are rejected.
- Recommendation: decide the import contract. If the contract is “has a privateKey column,” add a small CSV parser for that column and tests.

### 8. Browser-facing Phase 2 DoD is not covered by browser tests
- Verdict: CONFIRMED
- Impact: MED
- Confidence: 0.86
- Score: 1.72
- Evidence:
  - `PLAN.md` Phase 2 DoD is browser-facing: roster table, import/export, settings persist per session.
  - `src/components/smithii-agent-app.tsx:275-347` implements roster UI and import/export wiring.
  - `src/components/smithii-agent-app.tsx:81-88` and `493-498` implement sessionStorage wiring.
  - `vitest.config.ts` has no jsdom/browser environment and tests are helper/route unit tests.
- Risk: helper tests can pass while the actual browser wiring regresses.
- Recommendation: add a lightweight browser/component or Playwright smoke once Phase 2 UI is treated as phase-complete.

## Partial Findings

### Persisted settings may cause first-load hydration mismatch
- Verdict: PARTIAL
- Evidence: `src/components/smithii-agent-app.tsx:70-72` uses a lazy initializer that reads `sessionStorage` on the client, while `getInitialGlobalSettings` returns defaults when `window` is unavailable at `493-498`.
- Risk: server-rendered default markup can differ from the first client render when a tab has saved settings.
- Why partial: no browser reproduction was run in this SMAC pass, and no verifier completed for this exact finding.
- Recommendation: initialize with defaults and load stored settings in a mount-only effect if a mismatch appears.

### Storage access exceptions are not caught
- Verdict: PARTIAL
- Evidence: `src/lib/global-settings.ts:52-72` catches JSON parse errors but not `getItem`/`setItem` exceptions.
- Risk: blocked storage or quota errors can break settings initialization/update.
- Why partial: normal browser contexts usually permit sessionStorage; impact is environment-specific.
- Recommendation: make persistence best-effort by catching storage read/write failures.

### Expired pending plans return chat-level 200 instead of route-level 410
- Verdict: PARTIAL
- Evidence: `src/lib/agent/mock-chat.ts:196-206` handles expiry as a normal mock-chat result. Phase 7 DoD says expired plan IDs return `410`.
- Why partial: Phase 7 is not complete; current behavior is still tested at the mock-agent layer.
- Recommendation: promote this when Phase 7 route semantics begin.

### Bundle Launch dev-wallet `dev_buy` fee ambiguity
- Verdict: PARTIAL
- Evidence: `PLAN.md` comments that dev-wallet fees include `dev_buy`, while `src/lib/smithii/mock.ts:33-35` computes service plus pregenerate only.
- Why partial: the plan has no concrete `dev_buy` input field, so implementation is not safely inferable.
- Recommendation: ask Smithii/product whether dev buy is in MVP. Then update either the type/math or the PLAN.

### Volume Bot status/pause contract is absent
- Verdict: PARTIAL
- Evidence: `src/lib/smithii/mock.ts:131-135` only has `executeVolumeBot`; PLAN later describes pause/resume/status.
- Why partial: this belongs to Phase 5, not the current Phase 2 delta.
- Recommendation: keep deferred until Volume Bot lifecycle work starts.

## Design Choices

- Internal camelCase DTOs versus PLAN snake_case external contract names are acceptable before the Smithii-facing adapter exists. Do not treat naming alone as a bug; validate/normalize at boundaries instead.
- Bundle Swap currently uses enriched internal wallet objects. That is a design choice for the mock/internal prepare layer until external tool schemas are implemented.
- Local `.smithii-local/plan-records.json` persistence is acceptable for the mock/local phase; production persistence belongs later.
- Mock Smithii execution IDs and hard-coded routing are acceptable under the documented mock-first scope.

## Disputed Findings

- No private-key custody leak was confirmed. Current UI sends public launch selections, the route rejects recursive `privateKey` fields, and route tests cover the known leak path.
- “Bundle Sell missing” is a false positive; the PLAN explicitly replaces legacy Bundle Sell with Bundle Swap.

## Dead Code

No confirmed dead code found in this scoped run.

## Coverage Gaps

- `D:\smithii-agent` is not a Git repository in this environment, so git-intent checks were unavailable.
- Two verifier agents failed due usage limits. Three usable verifier outputs were still received.
- No Playwright/browser reproduction was run for hydration or UI state findings.
- This was a scoped Phase 2 delta audit, not a full repo re-audit of every future PLAN item.

## Run Stats

- Operating mode: general
- Researchers requested: 5 domain researchers plus 1 Skeptic
- Usable researchers: 5
- Usable Skeptic reports: 1
- Verifiers requested: 5
- Usable verifiers: 3
- Verifier failures: 2 usage-limit errors
- Findings total after merge: 15
- Confirmed: 8
- Partial: 5
- Design choices: 4
- Disputed/false positives: 2
- Dead code: 0
- Final local verification: `pnpm test` passed, `pnpm lint` passed, `pnpm build` passed.

## Confirmed Cleanup Backlog

### 1. Normalize route-level global settings
- Category: strong-types
- Files in scope: `src/app/api/chat/route.ts`, `src/lib/global-settings.ts`, `tests/unit/chat-route.test.ts`
- Recommended owner/work package: API boundary hardening
- Verification: `pnpm test -- tests/unit/chat-route.test.ts tests/unit/global-settings.test.ts`
- Dependencies: none
- Safe to batch: yes, with draft parser route hardening

### 2. Add route parser for incoming drafts
- Category: strong-types
- Files in scope: `src/app/api/chat/route.ts`, `src/lib/agent/mock-chat.ts`, `tests/unit/chat-route.test.ts`
- Recommended owner/work package: API boundary hardening
- Verification: malformed draft route test plus `pnpm test -- tests/unit/chat-route.test.ts tests/unit/mock-agent.test.ts`
- Dependencies: none
- Safe to batch: yes, with global settings normalization

### 3. Validate launch wallet selection against draft data
- Category: error-handling
- Files in scope: `src/app/api/chat/route.ts`, `src/lib/agent/mock-chat.ts`, `tests/unit/chat-route.test.ts`, `tests/unit/mock-agent.test.ts`
- Recommended owner/work package: preview consistency hardening
- Verification: mismatched wallet count and mismatched buy amount tests
- Dependencies: draft validation helps make this cleaner
- Safe to batch: yes, with draft parser work

### 4. Clear stale previews during draft collection
- Category: error-handling
- Files in scope: `src/components/smithii-agent-app.tsx`
- Recommended owner/work package: client preview state handling
- Verification: component/browser smoke or focused helper extraction test if state transition is extracted
- Dependencies: none
- Safe to batch: yes, with invalid pending-plan UI cleanup

### 5. Clear stale client state on invalid pending-plan responses
- Category: error-handling
- Files in scope: `src/components/smithii-agent-app.tsx`
- Recommended owner/work package: client error handling
- Verification: component/browser smoke or extracted error-handler unit test
- Dependencies: none
- Safe to batch: yes, with stale preview cleanup

### 6. Make demo roster import/export internally consistent
- Category: strong-types
- Files in scope: `src/lib/wallet-roster.ts`, `tests/unit/wallet-roster.test.ts`
- Recommended owner/work package: wallet roster contract
- Verification: add export-to-import round-trip test
- Dependencies: import contract decision
- Safe to batch: yes, with CSV privateKey column support if the import contract is widened

### 7. Decide and enforce CSV privateKey column semantics
- Category: strong-types
- Files in scope: `src/lib/wallet-roster.ts`, `tests/unit/wallet-roster.test.ts`
- Recommended owner/work package: wallet roster contract
- Verification: tests for single-column CSV and multi-column CSV with `privateKey`
- Dependencies: product decision on whether single-column-only is intentional
- Safe to batch: yes, with demo roster consistency
