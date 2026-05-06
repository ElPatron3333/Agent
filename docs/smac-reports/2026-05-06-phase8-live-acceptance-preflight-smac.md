# SMAC Report: Phase 8 Live Acceptance Preflight Cleanup

Date: 2026-05-06
Mode: cleanup
Scope: commits `b796456` and `c5d617c`; `package.json`, `scripts/phase8-live-preflight.mjs`, `docs/phase8-live-acceptance-runbook.md`, `docs/phase8-live-acceptance-attempt-2026-05-06.md`, `docs/examples/phase8-burner-wallets.sample.csv`
Coverage: multi-agent research with main-thread verification and synthesis
Low-coverage warning: dedicated verifier subagent batch was not run; verification was performed directly in the main thread with targeted commands.

## Ranked Findings

### 1. Preflight Can Pass Secret-Bearing Wallet CSVs Inside The Repo

- Impact: MED
- Confidence: 0.94
- Verification verdict: CONFIRMED
- Category: error-handling
- File: `scripts/phase8-live-preflight.mjs:43`
- Code:

```js
const resolvedWalletCsv = path.resolve(args.walletCsv);
```

The preflight accepts any existing `--wallet-csv` path. A real burner private-key CSV placed under the repo root, including a tracked or unignored path, can satisfy preflight. This conflicts with the zero-custody/operator-safety model because real wallet keys should not be normalized into repo-local tracked files.

Verification:

- Code match: MATCH. The script resolves and reads any path without checking repo containment or git ignore state.
- Git intent: Added by `b796456`, tightened by `c5d617c`; no git intent indicates repo-internal secret files should be allowed.
- Test intent: No CLI tests exist for wallet CSV path safety.
- Reachability: `pnpm phase8:live-preflight` directly executes this path.
- Runtime impact: Confirmed with a throwaway untracked repo-root CSV; current preflight reported `Status: READY`.
- Scope safety: Blocking unignored repo-internal CSVs preserves outside-repo and ignored-local paths.

### 2. Wallet CSV Validation Diverges From Browser Import

- Impact: MED
- Confidence: 0.90
- Verification verdict: CONFIRMED
- Category: error-handling
- File: `scripts/phase8-live-preflight.mjs:53`
- Code:

```js
if (rows[0] !== "privateKey") {
  blockers.push(`Wallet CSV must start with a single privateKey header: ${resolvedWalletCsv}`);
}
```

The app's browser import accepts a `privateKey` column in multi-column CSV files, but the preflight requires the entire header row to equal `privateKey`. The same script also accepts any non-placeholder value, while the browser import rejects private keys outside the repo's base58 shape check.

Verification:

- Code match: MATCH. Preflight checks `rows[0] === "privateKey"` and does not validate key shape.
- Git intent: The stricter header and placeholder checks were added as quick live-preflight hardening, not as a deliberate alternate CSV contract.
- Test intent: `tests/unit/wallet-roster.test.ts` covers `label,privateKey,notes`; no preflight test covers this.
- Reachability: Any operator-provided wallet CSV passes through this logic.
- Runtime impact: Confirmed with temp files: malformed `not-valid-000` reported `READY`; multi-column valid CSV reported `BLOCKED`.
- Scope safety: Aligning with the browser import contract only changes preflight gating before live acceptance.

### 3. Runbook Preflight Checklist Is Stale After Tightening

- Impact: LOW
- Confidence: 0.93
- Verification verdict: CONFIRMED
- Category: comment-slop
- File: `docs/phase8-live-acceptance-runbook.md:61`
- Code:

```md
- required env vars are set
- wallet CSV exists and starts with `privateKey`
- swap mint argument is present
- launch image exists with a supported extension
```

The checklist omits behavior now enforced by `c5d617c`: env files are loaded, wallet rows must be non-placeholder, swap mint must parse as a Solana public key, and a real wallet CSV should not be placed in a tracked repo path.

Verification:

- Code match: MATCH. The checklist does not describe the tightened script behavior.
- Git intent: `c5d617c` changed script behavior and updated only part of the runbook.
- Test intent: Docs are not covered by tests.
- Reachability: This is the operator-facing live acceptance runbook.
- Runtime impact: Operators can misread why preflight blocks or passes.
- Scope safety: Updating wording does not alter execution.

### 4. Preflight CLI Has No Automated Test Coverage

- Impact: MED
- Confidence: 0.88
- Verification verdict: CONFIRMED
- Category: error-handling
- File: `package.json:10`
- Code:

```json
"test": "vitest run",
"phase8:live-preflight": "node scripts/phase8-live-preflight.mjs"
```

The new package script is operator-critical but not covered by `pnpm test`. The missing tests allowed the malformed-key `READY` behavior and multi-column CSV mismatch to survive initial implementation.

Verification:

- Code match: MATCH. `package.json` exposes the script; source search found no tests for `phase8-live-preflight`.
- Git intent: Added as live-acceptance tooling in `b796456`.
- Test intent: Existing tests cover wallet roster import but not the CLI.
- Reachability: Operators run this before real mainnet acceptance.
- Runtime impact: Confirmed bugs were observable only through manual CLI checks.
- Scope safety: Adding bounded CLI tests is low-risk.

## Partial Findings

### Attempt Doc Uses Wrapped SOL In A Dry-Run Command

- File: `docs/phase8-live-acceptance-attempt-2026-05-06.md:43`
- Verdict: PARTIAL
- Reason: `So11111111111111111111111111111111111111112` was the actual blocked dry-run command, so replacing it would falsify the record. A note clarifying that it is not an approved Pump target is useful, but the command itself can remain as historical output.

### Env Loader Only Reads `.env.local` And `.env`

- File: `scripts/phase8-live-preflight.mjs:6`
- Verdict: PARTIAL
- Reason: This may be intentionally narrower than Next's full env loading. It is safe to improve, but current docs and local scaffold specifically use `.env.local`.

### Metadata Upload First Is Not A Standalone Step

- File: `docs/phase8-live-acceptance-runbook.md:68`
- Verdict: PARTIAL
- Reason: Smithii recommended metadata upload before Bundle Buy/Sell and Launch, but the app does not expose a standalone upload-only command. The runbook should document that launch metadata upload must be treated as a pre-transaction blocker if it fails.

## Design Choices

- `Status: BLOCKED` before live execution is intentional when real runtime inputs are missing.
- The sample CSV is intentionally placeholder-only and should fail preflight.
- Low-amount mainnet testing is intentional because Smithii confirmed there is no sandbox/devnet endpoint.
- Browser wallet approval remains manual by architecture.
- Wallet balances and browser extension state remain manual checks, not CLI checks.
- `NEXT_PUBLIC_SMITHII_JITO_UUID` remains intentionally unset until Smithii/operator provides it.

## Dead Code

No dead code findings in this scoped audit.

## Disputed Findings

No fully disputed findings. Several findings were downgraded to partial because the attempt document is a historical record and because some live checks are intentionally manual.

## Coverage Gaps

- Lint was started with a 120s timeout and did not complete before timing out.
- No live Smithii transaction was executed.
- No real burner wallet CSV, launch image, or Jito UUID was available.
- Verification was main-thread only after multi-agent research; no independent verifier batch was run.

## Run Stats

- Domain researchers: 5 usable
- Skeptic roles: 1 usable
- Findings total: 8 raw findings
- Confirmed: 4
- Partial: 3
- Design choices: 6
- Disputed: 0
- Dead code: 0
- Confirmed cleanup backlog items: 3 packages

## Confirmed Cleanup Backlog

### 1. Harden Wallet CSV Preflight Gate

- Title: Harden wallet CSV preflight gate
- Category: error-handling
- Exact files in scope: `scripts/phase8-live-preflight.mjs`, `tests/unit/phase8-live-preflight.test.ts`
- Recommended write owner or work package: preflight CLI validation
- Verification command or check: `pnpm test -- --run tests/unit/phase8-live-preflight.test.ts`; targeted `pnpm phase8:live-preflight` smoke command
- Dependencies on other findings: none
- Safe to batch with adjacent work: yes, with runbook checklist cleanup

Objective: Reject unignored repo-internal wallet CSVs, accept the same `privateKey` column shape as the browser importer, and reject malformed private-key rows without printing secret values.

### 2. Add Bounded Preflight CLI Tests

- Title: Add bounded preflight CLI tests
- Category: error-handling
- Exact files in scope: `tests/unit/phase8-live-preflight.test.ts`, `scripts/phase8-live-preflight.mjs`
- Recommended write owner or work package: preflight CLI validation
- Verification command or check: `pnpm test -- --run tests/unit/phase8-live-preflight.test.ts`
- Dependencies on other findings: should accompany wallet CSV gate hardening
- Safe to batch with adjacent work: yes

Objective: Cover placeholder CSV, malformed CSV, repo-internal unignored CSV, multi-column valid CSV, invalid mint, unsupported image extension, and ready-path behavior.

### 3. Align Live Acceptance Docs With Preflight Behavior

- Title: Align live acceptance docs with preflight behavior
- Category: comment-slop
- Exact files in scope: `docs/phase8-live-acceptance-runbook.md`, `docs/phase8-live-acceptance-attempt-2026-05-06.md`
- Recommended write owner or work package: operator runbook cleanup
- Verification command or check: direct doc review plus `pnpm phase8:live-preflight` blocked smoke output
- Dependencies on other findings: should follow wallet CSV gate behavior
- Safe to batch with adjacent work: yes

Objective: State that real wallet CSVs must live outside the repo or in ignored local paths, update the checklist to match script checks, clarify the dry-run mint is not an approved Pump test target, and document metadata upload as a pre-transaction launch blocker.
