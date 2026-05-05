# SMAC Report: Phase 8D Pump Browser Executor

Date: 2026-05-06
Branch: `feature/phase8d-pump-browser-executor`
Mode: `cleanup`
Coverage: single-thread fallback with explicit researcher/verifier role separation
Target: Phase 8D browser executor foundation

## Scope

Audited the Phase 8D delta:

- `src/lib/smithii/pump-browser-executor.ts`
- `tests/unit/smithii-pump-browser-executor.test.ts`
- `src/lib/smithii/browser-handoff.ts`
- `docs/superpowers/specs/2026-05-06-phase8d-pump-browser-executor-design.md`
- `docs/superpowers/plans/2026-05-06-phase8d-pump-browser-executor.md`
- Smithii SDK local type declarations under `node_modules/@smithii/sdk/dist`

Repo guidance checked: `AGENTS.md`, `PLAN.md`.

## Researcher Reports

# Researcher Report: SDK Contract And Strong Types

## Finding 1: Launch executor accepts a weaker mint keypair than Smithii SDK requires
- File:Line: `src/lib/smithii/pump-browser-executor.ts:45`
- Code: `export type PumpMintKeypairInput = {`
- Description: The executor's public input type only requires `publicKey.toBase58()`, but the Smithii SDK `PumpCreateAndSnipeArgs` requires a real Solana `Keypair`. A future caller could satisfy this exported type with a public-key-only object; the executor would pass it into `createAndSnipeToken`, where the SDK expects the actual keypair for mint signing.
- Impact: MED
- Effort: LOW
- Confidence: 0.95
- Recommendation: Import the SDK launch argument contract or use `Keypair` directly for `mintKeypair`, and update tests to use `Keypair.generate()` instead of a fake public-key-only object.
- Why this might be wrong: The current tests intentionally use a fake structural keypair to avoid coupling to Solana internals, and no live UI calls this yet.

## Finding 2: SDK method results are typed as unknown and can fail open into success-shaped outputs
- File:Line: `src/lib/smithii/pump-browser-executor.ts:25`
- Code: `uploadMetadata(input: PumpBundleLaunchMetadataInput): Promise<unknown>;`
- Description: The structural client returns `unknown` for Smithii calls, while the executor turns missing result fields into `undefined` or empty arrays at `src/lib/smithii/pump-browser-executor.ts:229` and `src/lib/smithii/pump-browser-executor.ts:262`. The installed SDK declares those result fields as required strings/arrays, so the adapter should either type them as required or validate them before returning a success result.
- Impact: MED
- Effort: LOW
- Confidence: 0.90
- Recommendation: Align the structural client with `@smithii/sdk/pump` type exports and add required-result validation that throws a local execution error on malformed launch or swap results.
- Why this might be wrong: The real Smithii SDK currently returns the required fields, so malformed results are mostly a wrapper/test-double risk today.

# Researcher Report: Secret Boundary And Error Safety

No confirmed cleanup findings. The executor does not log inputs, does not return buyer/private-key arrays, and tests assert that raw secret-looking fields are absent from successful result JSON.

Possible watch item: normalized `message` strings are intentionally copied from SDK-like errors. If a future SDK error message includes a raw private key, the local normalizer would not redact it. This is not promoted because the Phase 8D design explicitly includes `message`, and known Smithii SDK validation messages do not echo private key values.

# Researcher Report: Backend Boundary And Reachability

No confirmed cleanup findings. `rg -n "pump-browser-executor" src/app` returned no matches, so the new browser executor is not imported from backend routes. The executor is currently reachable only from its unit test and future browser UI code.

# Researcher Report: Test Coverage And Regression Shape

## Finding 1: The launch test reinforces the weak mint-keypair contract
- File:Line: `tests/unit/smithii-pump-browser-executor.test.ts:71`
- Code: `const mintKeypair = {`
- Description: The test uses a fake object with only `publicKey.toBase58()`, which matches the local weak type but not the SDK's `Keypair` requirement. This makes the type drift harder to catch.
- Impact: MED
- Effort: LOW
- Confidence: 0.90
- Recommendation: Use `Keypair.generate()` in the launch executor test and assert the returned mint with `mintKeypair.publicKey.toBase58()`.
- Why this might be wrong: The fake was requested in the original implementation plan and keeps the unit test focused on sequencing.

# Researcher Report: Dependency Graph And Layering

No confirmed cleanup findings. The new executor imports only type-level browser handoff contracts and Solana public types. There is no import cycle or server route dependency introduced.

# Researcher Report: Conservative False-Positive Pass

No cleanup promotion for missing live UI wiring, missing backend execution, token-to-token rejection, Volume Bot blocking, or local browser-only placement. Those are deliberate Phase 8D scope decisions.

# Researcher Report: Skeptic

The main defense is that Phase 8D intentionally uses structural types and fake clients for a browser-boundary adapter. That defense is valid for avoiding direct client construction, but weakens once the exported `mintKeypair` input type becomes public API for future UI callers. Type-only imports from `@smithii/sdk/pump` and `@solana/web3.js` preserve the structural adapter goal while removing the drift.

## Verifier Reports

# Verifier Report: Checking SDK Contract And Strong Types

## Finding 1: Launch executor accepts a weaker mint keypair than Smithii SDK requires
- Code match: MATCH. Local type at `src/lib/smithii/pump-browser-executor.ts:45` only requires `publicKey.toBase58()`.
- Git intent: Added in `b0aeae1 Add Phase 8D Pump browser executor`; the design said fake keypair tests were acceptable, but production adapter goal is SDK alignment.
- Test intent: Current test at `tests/unit/smithii-pump-browser-executor.test.ts:71` uses the weak fake shape.
- Reachability: Future browser UI callers would import this exported input type; current runtime reachability is test-only.
- Scope safety: Replacing the type with `Keypair` and updating tests is local to executor/test files.
- Runtime impact: Prevents future UI code from compiling with a public-key-only mint object before live execution wiring.
- Mode-specific checks: Strong-types cleanup removes local contract drift without changing backend behavior.
- Verdict: CONFIRMED
- Reason: The installed SDK declares `mintKeypair: Keypair` for `PumpCreateAndSnipeArgs`.

## Finding 2: SDK method results are typed as unknown and can fail open into success-shaped outputs
- Code match: MATCH. Client methods return `unknown` at `src/lib/smithii/pump-browser-executor.ts:25`, and output normalization defaults missing arrays to `[]` at `src/lib/smithii/pump-browser-executor.ts:230` and `src/lib/smithii/pump-browser-executor.ts:262`.
- Git intent: Added in the Phase 8D implementation as a lightweight structural client.
- Test intent: Tests cover happy-path results but not malformed SDK-like success payloads.
- Reachability: Future browser UI callers would trust these returned result objects for render/audit handoff.
- Scope safety: Adding typed SDK return contracts and malformed-result tests is local and does not change successful SDK calls.
- Runtime impact: Failing closed is safer than rendering a success response without signatures or bundle IDs.
- Mode-specific checks: Strong-types and error-handling cleanup is bounded and removes real ambiguity.
- Verdict: CONFIRMED
- Reason: The SDK declares required result fields, so the adapter should not silently accept missing required fields.

# Verifier Report: Checking Secret Boundary And Error Safety

No promoted findings. Successful result sanitization tests exist and backend routes do not import this executor. Error message redaction remains a design watch item, not cleanup backlog, because copying `message` is part of the approved local normalized error contract.

# Verifier Report: Checking Backend Boundary And Reachability

No promoted findings. `rg -n "pump-browser-executor" src/app` had no matches. The missing `src/pages` folder in the original planned command is a command-shape issue, not a code defect.

# Verifier Report: Checking Test Coverage And Regression Shape

## Finding 1: The launch test reinforces the weak mint-keypair contract
- Code match: MATCH. Test uses a fake keypair object at `tests/unit/smithii-pump-browser-executor.test.ts:71`.
- Git intent: Intentional from the implementation plan, but it conflicts with the real SDK type contract.
- Test intent: The test verifies sequencing and safe result projection, not SDK argument shape.
- Reachability: Test-only, but it masks the exported type drift.
- Scope safety: Update to `Keypair.generate()` is local and still deterministic enough for assertions.
- Runtime impact: Improves the test's fidelity before future UI integration.
- Mode-specific checks: Safe to batch with the SDK type alignment package.
- Verdict: CONFIRMED
- Reason: It is the test-side manifestation of the same SDK contract drift.

## Ranked Findings

1. [MED / 95%] Launch executor accepts a weaker mint keypair than Smithii SDK requires.
2. [MED / 90%] SDK method results are typed as `unknown` and can fail open into success-shaped outputs.
3. [MED / 90%] Launch test reinforces the weak mint-keypair contract.

## Disagreements

- The original Phase 8D plan requested a fake mint keypair for tests. The audit treats this as acceptable for early TDD but not acceptable as the exported production-facing input type now that the Smithii SDK contract is known locally.

## Design Choices

- No live UI button in this phase.
- No backend live execution in this phase.
- Token-to-token swaps remain blocked before SDK calls.
- Volume Bot remains out of scope for this executor.
- Browser-only placement in `src/lib/smithii` is acceptable while backend route imports are absent.

## Dead Code

None found.

## Disputed Findings

None promoted.

## Coverage Gaps

- Single-thread fallback only; no true parallel multi-agent coverage was used in this environment.
- No live Smithii network execution was performed.
- No browser UI imports this executor yet, so UI integration remains future work.

## Run Stats

- Researchers simulated: 6 domain roles plus 1 Skeptic.
- Usable researcher outputs: 6.
- Verifier passes simulated: 4.
- Confirmed findings: 3 findings, merged into 1 cleanup package.
- Partial findings: 0.
- Disputed findings: 0.
- Design choices: 5.
- Dead code findings: 0.

## Confirmed Cleanup Backlog

### 1. Align Pump browser executor with Smithii SDK types and fail closed on malformed results

- Category: strong-types
- Exact files in scope:
  - `src/lib/smithii/pump-browser-executor.ts`
  - `tests/unit/smithii-pump-browser-executor.test.ts`
- Recommended write owner or work package: Phase 8D Pump browser executor package.
- Recommendation: Use `Keypair` and `@smithii/sdk/pump` type exports for the structural client/input contracts, update tests to use a real generated mint keypair, and add regression coverage that malformed launch/swap result payloads throw a local `PumpBrowserExecutionError` instead of returning success-shaped outputs.
- Verification command or check:
  - `pnpm vitest run tests/unit/smithii-pump-browser-executor.test.ts`
  - `pnpm vitest run tests/unit/smithii-pump-browser-executor.test.ts tests/unit/smithii-browser-handoff.test.ts tests/unit/chat-route.test.ts`
  - `pnpm test`
  - `pnpm lint`
  - `pnpm build`
  - `git diff --check`
- Dependencies on other findings: None.
- Safe to batch with adjacent work: Yes; this batches the executor type alignment and its tests because they share the same two files.
