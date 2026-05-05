# SMAC Report: Smithii Agent Phase 8C Browser Handoff

Date: 2026-05-06
Mode: general
Coverage: single-thread fallback
Branch: `feature/phase8c-browser-handoff`
Commit audited: `323cbe3 Add Phase 8C browser handoff foundation`

## Scope

This audit covers the Phase 8C-A changes after Smithii's final answers were incorporated:

- `docs/phase8c-answer-intake-2026-05-06.md`
- `docs/phase8c-readiness-matrix.md`
- `src/lib/smithii/browser-handoff.ts`
- `src/lib/smithii/live-boundary.ts`
- `.env.example`
- Updated unit tests for browser handoff, live boundary, and Phase 8C readiness docs

The audit stayed read-only except for this report and the required SMAC learning log. No cleanup fixes were made in this run.

## Role Design

The SMAC skill normally uses delegated researchers. Delegation was not authorized in this turn, so I ran the required single-thread fallback while keeping the same role separation:

1. Zero-custody and sensitive-field boundary researcher
2. Browser handoff plan/idempotency researcher
3. Live-boundary and flow-classification researcher
4. Dependency and server/browser layering researcher
5. Test coverage and regression researcher
6. Dead config and stale documentation researcher
7. Skeptic role for false-positive defense

## Ranked Findings

### 1. [MED / 92%] `mnemonic` is documented as sensitive but not rejected by the new or existing private-key deny-lists

Verdict: CONFIRMED
Ranking score: 1.84
Category: error-handling

Evidence:

- `docs/phase8c-answer-intake-2026-05-06.md:71` says never monitor or log `mnemonic phrases`.
- `src/lib/smithii/browser-handoff.ts:42` defines the new browser-plan sensitive-field deny-list with `pk`, `privatekey`, `privatekeys`, `private_key`, `privkeys`, `secretkey`, and `seedphrase`, but not `mnemonic`.
- `src/app/api/chat/route.ts:65` defines the route-level deny-list with the same omission.
- `tests/unit/smithii-browser-handoff.test.ts:43` and `tests/unit/chat-route.test.ts:1213` cover the older aliases but not `mnemonic`.

Why this matters:

The final Smithii answer expanded the documented sensitive material from seed phrases to mnemonic phrases. A direct request body or browser handoff params object using a literal `mnemonic` key is not rejected by the current recursive field guard. The route may still ignore or strip unknown data later, but the zero-custody backend rule is stronger: private-key-shaped fields should fail before backend processing.

Verifier checks:

- Code match: MATCH. The cited deny-lists omit `mnemonic`.
- Git intent: The Phase 8C-A commit added the browser handoff deny-list after receiving Smithii answers but did not incorporate the exact `mnemonic` wording.
- Test intent: Tests pin the alias set and omit `mnemonic`, so they would not catch this regression.
- Reachability: The route guard runs on every `/api/chat` request body at `src/app/api/chat/route.ts:102`. The browser handoff plan guard runs before hashing params at `src/lib/smithii/browser-handoff.ts:61`.
- Scope safety: Adding `mnemonic` to the existing exact-key deny-list is narrow and matches documented security policy.
- Runtime impact: This is a security-boundary hardening issue. It is not evidence of response leakage, but it allows sensitive-shaped material to enter backend request processing or plan hashing.

Recommendation:

Add `mnemonic` to the route and browser-handoff deny-lists, then add regression coverage in `tests/unit/chat-route.test.ts` and `tests/unit/smithii-browser-handoff.test.ts`. If possible, centralize the alias list so future Smithii answer wording cannot drift across modules.

Why this might be wrong:

Some systems treat `mnemonic` as a generic label. In this app's context, Smithii explicitly named mnemonic phrases next to private keys and seed phrases, so the conservative interpretation is to reject it.

### 2. [LOW / 84%] Browser plan hashing silently treats `undefined` params as an empty-string hash

Verdict: CONFIRMED
Ranking score: 0.84
Category: strong-types

Evidence:

- `src/lib/smithii/browser-handoff.ts:22` accepts `params: unknown`.
- `src/lib/smithii/browser-handoff.ts:68` hashes `stableJson(params)`.
- `src/lib/smithii/browser-handoff.ts:136` returns `JSON.stringify(sortJsonValue(value))` as a `string`.
- At runtime, `JSON.stringify(undefined)` returns `undefined`, and `TextEncoder().encode(undefined)` encodes an empty string in Node. The resulting params hash is the SHA-256 of empty bytes.
- `tests/unit/smithii-browser-handoff.test.ts:13` covers a normal object only; there is no null/undefined/non-JSON regression.

Why this matters:

The browser execution plan is the first non-secret metadata binding for live handoff. If a future caller accidentally passes `undefined`, a function, or a symbol-like non-JSON value, the helper produces a valid-looking plan whose params hash does not bind meaningful params. That undercuts the purpose of local preview-to-execute binding.

Verifier checks:

- Code match: MATCH. The typed `string` return does not match the runtime behavior for undefined input.
- Git intent: Phase 8C-A introduced the helper as a foundation for non-secret plan records; no evidence suggests empty-string hashing for undefined was intentional.
- Test intent: Existing tests prove deterministic hashing for an object, not edge-case input behavior.
- Reachability: The helper is currently imported only by tests, so this is a foundation bug rather than a live execution bug today.
- Scope safety: A fix can be local: reject `undefined` params or constrain the input to JSON-serializable values and test `null` versus omitted params.
- Runtime impact: Low now, higher once server-issued or browser-issued plan records are wired into the UI.

Recommendation:

Make the plan input explicit: either require JSON-serializable params and reject `undefined`/functions/symbols, or normalize `undefined` to a deliberate sentinel string. Add tests for `undefined`, `null`, arrays, and nested objects so idempotency keys stay stable and intentional.

Why this might be wrong:

Current callers are tests only, and future UI code will probably pass plain JSON objects. The issue is still worth fixing because this helper exists specifically to become a safety boundary.

### 3. [LOW / 86%] `.env.example` still advertises Smithii partner auth/origin fields after Smithii answered that no partner auth or domain lock is required

Verdict: CONFIRMED
Ranking score: 0.86
Category: legacy-removal / comment-slop

Evidence:

- `.env.example:25` labels the section as `Future Smithii partner integration`.
- `.env.example:26` keeps `SMITHII_LICENSE_KEY=`.
- `.env.example:27` keeps `NEXT_PUBLIC_SMITHII_ORIGIN=`.
- `docs/phase8c-answer-intake-2026-05-06.md:29` says Smithii reported no partner-only auth, domain lock, OAuth, or partner key; only Jito UUID and proxy URL are runtime config.
- `rg -n "SMITHII_LICENSE_KEY|NEXT_PUBLIC_SMITHII_ORIGIN"` found no source usage beyond `.env.example`.

Why this matters:

These placeholders were reasonable before Smithii answered. After Phase 8C-A, they now point future work toward a partner-auth path that the answer intake says not to build. This is not a runtime bug, but it is stale configuration guidance in the file a developer will consult first when wiring live handoff.

Verifier checks:

- Code match: MATCH. The unused placeholders are present and the answer intake contradicts the partner-auth implication.
- Git intent: The Phase 8C-A commit added `NEXT_PUBLIC_SMITHII_PROXY_URL` and `NEXT_PUBLIC_SMITHII_JITO_UUID` but retained the older placeholders.
- Test intent: No tests cover `.env.example` Smithii runtime config consistency.
- Reachability: Developer-facing only; not imported at runtime.
- Scope safety: Removing or relabeling the stale fields is low risk because no code references them.
- Runtime impact: Low direct impact, medium process risk if someone blocks live testing waiting for a nonexistent Smithii license/origin key.

Recommendation:

Replace the Smithii env section with the actual Phase 8C runtime config: public Solana RPC URL, Smithii proxy URL, and Jito UUID. Remove `SMITHII_LICENSE_KEY` and `NEXT_PUBLIC_SMITHII_ORIGIN` unless a future Smithii answer reintroduces them.

Why this might be wrong:

The project may still want placeholders for a future commercial auth model. The current Smithii answer says not to add one for this package, so leaving them in `.env.example` is more likely to mislead than help.

## Disagreements

### Browser SDK imports in `src/lib/smithii/browser-handoff.ts`

Research concern: `createBrowserExecutionPlan` and `createPumpBrowserClient` live in the same module, and the module imports `PumpFunClient` plus `Connection` at top level. If future server code imports only the plan helper, it will still load the browser/live SDK surface.

Skeptic defense: `rg -n "browser-handoff" src tests docs` shows the module is currently imported only by tests and by its own docs references. No server route imports it, and no live Smithii execution is wired today.

Synthesis: DESIGN_CHOICE / WATCH. Do not promote to cleanup backlog yet. When the server-issued plan/auth record work starts, split server-safe plan helpers from browser-only SDK client creation or add an explicit client-only boundary.

### `browser-handoff-ready` can sound like production-ready

Research concern: The UI label says `Browser handoff ready`.

Skeptic defense: `src/components/smithii-agent-app.tsx:1117` clarifies that backend live execution remains blocked. Prior SMAC learning also says this term means known SDK target, not live-ready-to-run.

Synthesis: DESIGN_CHOICE. Keep watching copy before a live button is added, but this is not a current defect.

### Historical Phase 8A docs still mention waiting for a browser-side module

Research concern: `docs/phase8a-live-boundary.md:12` says execution happens after Smithii provides the module.

Skeptic defense: Phase 8A is historical. Phase 8C docs now contain dated answer intake and readiness decisions.

Synthesis: DISPUTED as a cleanup item. Do not rewrite historical phase docs unless they are presented as the current source of truth.

## Design Choices

- Phase 8C-A is a foundation package, not a UI live-execute implementation. No finding was raised for the absence of a live button.
- `validatePumpBrowserHandoffConfig` checks trimmed values but returns the original strings. This is acceptable for now, though trimming could be harmless if config values are typed manually.
- Clearing `questionsForSmithii` for answered or explicitly blocked flows is consistent with the new intake note. Blockers remain in `blockers` where applicable.
- The low-amount mainnet test path remains documented but not executed. That is expected until runtime config, burner wallets, and explicit spend approval exist.

## Dead Code

- No unused source exports were confirmed in the Phase 8C-A code path.
- `.env.example` contains stale Smithii config placeholders (`SMITHII_LICENSE_KEY`, `NEXT_PUBLIC_SMITHII_ORIGIN`) with no source references. This is tracked as Finding 3 rather than source dead code.

## Disputed Findings

- Server-side live SDK execution was not confirmed. The new browser client helper exists, but source search did not find a server route importing it.
- Token-to-token Bundle Swap remains blocked by live-boundary metadata and tests. No regression was found there.
- Classic Volume Bot and Launch + Volume remain blocked after Smithii answered they are backend-keyed or lack a scheduler contract. No regression was found there.

## Coverage Gaps

- This was a single-thread fallback SMAC. It did not use multi-agent research or independent verifier agents.
- I did not inspect Smithii SDK internals beyond the public package usage already recorded by Phase 8C-A; this audit focused on our repo integration boundary.
- A direct runtime `/api/chat` mnemonic request was not executed because the repo does not provide `tsx` for one-off route invocation. The finding is based on exact code-match of the route guard and test coverage.
- No low-amount mainnet test was run. That remains blocked on runtime config, burner wallets, and explicit spend approval.

## Run Stats

- Operating mode: general
- Coverage model: single-thread fallback
- Domain researcher roles simulated: 6
- Skeptic roles: 1
- Usable researcher outputs: 6
- Verifier passes: main-thread circular checks for each finding
- Total findings considered: 6
- Confirmed findings: 3
- Partial findings: 0
- Disputed findings: 2
- Design choices/watch items: 4
- Dead code findings: 0 source findings, 1 stale config item

## Confirmed Cleanup Backlog

### 1. Add `mnemonic` to sensitive-field rejection

- Category: error-handling
