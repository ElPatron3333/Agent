# SMAC Report: Smithii Agent Phase 1/2 Audit

Date: 2026-04-29
Mode: general
Target: `D:\smithii-agent`
Coverage: multi-agent research and verification, with one local config/reachability pass

## Scope

Audited project-authored files built so far:

- `src/**`
- `tests/**`
- `README.md`
- `PLAN.md`
- `PHASE1_TICKETS.md`
- `AGENTS.md`
- root config files: `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `vitest.config.ts`, `postcss.config.mjs`, `pnpm-workspace.yaml`

Excluded generated/vendor artifacts: `node_modules`, `.next`, `_*.log`, `pnpm-lock.yaml` internals, and default public assets unless referenced by app code.

`D:\smithii-agent` is not a git repository, so git-intent checks could not use commit history. Intent was inferred from `PLAN.md`, `AGENTS.md`, `PHASE1_TICKETS.md`, tests, and runtime wiring.

## Ranked Findings

### 1. `/api/chat` can accept and echo private-key fields from malformed wallet payloads

- Verdict: CONFIRMED
- Impact: HIGH
- Confidence: 0.92
- Ranking score: 2.76
- Files:
  - `src/app/api/chat/route.ts:20`
  - `src/app/api/chat/route.ts:33`
  - `src/lib/agent/mock-chat.ts:526`
  - `src/lib/agent/mock-chat.ts:527`
- Evidence:
  - `const body = (await request.json()) as ChatRequest;`
  - `launchWalletSelection: body.launchWalletSelection ?? null,`
  - `devWalletPubkey: walletSelection.devWalletPubkey,`
  - `bundleWallets: walletSelection.bundleWallets,`
- Description: The route casts untrusted JSON to `ChatRequest` and forwards `launchWalletSelection` without runtime sanitization. `prepareLaunchPreview` reuses caller-provided wallet objects directly in `activePreview.bundleWallets`, so extra fields such as `privateKey` are echoed in the JSON response.
- Runtime check: a direct `/api/chat` request with `bundleWallets[0].privateKey = "PRIVATE_KEY_SHOULD_NOT_ECHO"` returned `ECHOED_PRIVATE_KEY_FIELD`.
- Skeptic cross-check: The normal UI path strips private keys, but the backend boundary itself does not enforce the rule. Runtime evidence overturned the route-minimalism defense.
- Recommendation: Add a route-level request sanitizer that recursively rejects `privateKey`, validates `launchWalletSelection` shape, rebuilds wallet objects with only `pubkey` and `buyAmountSol`, and add route tests proving no private-key echo.

### 2. Client-supplied pending plans can execute without a server-issued preview

- Verdict: CONFIRMED
- Impact: HIGH
- Confidence: 0.94
- Ranking score: 2.82
- Files:
  - `src/app/api/chat/route.ts:29`
  - `src/app/api/chat/route.ts:31`
  - `src/lib/agent/mock-chat.ts:144`
  - `src/lib/agent/mock-chat.ts:181`
- Evidence:
  - `pendingPlan: body.pendingPlan ?? null,`
  - `if (isConfirmIntent(normalized)) {`
  - `return executePendingPlan({ pendingPlan, now });`
- Description: `/api/chat` trusts `pendingPlan` from the client. A direct request can send `message: "confirm"` with a forged fresh `pendingPlan` and execute the mock handoff without first receiving a server-issued preview.
- Runtime check: a direct request with `pendingPlan: { id: "forged_plan", tool: "bundle_launch", createdAt: now }` returned `Mock Bundle Launch executed`.
- Skeptic cross-check: Current execution is mock-only, so no funds move today. The issue is still confirmed because the confirmation gate boundary is being built now and would be unsafe before real Smithii execution.
- Recommendation: Before real execution, make plans server-issued and session-bound or sign `{ id, tool, createdAt }` with an HMAC. For the mock phase, add tests rejecting forged and future-dated pending plans and avoid treating client state as proof of preview issuance.

### 3. Unknown pending plan tools fall through to Volume Bot execution

- Verdict: CONFIRMED
- Impact: MED
- Confidence: 0.96
- Ranking score: 1.92
- Files:
  - `src/lib/agent/mock-chat.ts:229`
  - `src/lib/agent/mock-chat.ts:244`
  - `src/app/api/chat/route.ts:31`
- Evidence:
  - `if (pendingPlan.tool === "bundle_swap") {`
  - `const execution = executeVolumeBot({ botId: pendingPlan.id });`
- Description: `executePendingPlan` handles `bundle_launch` and `bundle_swap`, then treats every other runtime `pendingPlan.tool` as Volume Bot. Since route JSON is only cast to `PendingPlan`, a malformed direct API request with `tool: "not_a_tool"` executes the Volume Bot mock path.
- Runtime check: a direct request with `tool: "not_a_tool"` returned `Mock Volume Bot started`.
- Recommendation: Add an explicit `volume_bot` branch and reject unknown tool values. Add a unit or route test for malformed `pendingPlan.tool`.

### 4. Client-provided launch wallet selection can override collected launch constraints

- Verdict: CONFIRMED
- Impact: MED
- Confidence: 0.86
- Ranking score: 1.72
- Files:
  - `src/lib/agent/mock-chat.ts:483`
  - `src/lib/agent/mock-chat.ts:504`
  - `src/lib/agent/mock-chat.ts:527`
- Evidence:
  - `const walletSelection = launchWalletSelection ?? buildFallbackLaunchWalletSelection({`
  - `devWalletPubkey: walletSelection.devWalletPubkey,`
  - `bundleWallets: walletSelection.bundleWallets,`
- Description: The draft validates `walletCount` and `solPerWallet`, but a supplied `launchWalletSelection` is preferred without checking that its length and buy amounts match the collected draft.
- Reachability: Normal UI currently builds the selection from the draft, but direct API and malformed client state can produce a preview inconsistent with the conversation.
- Recommendation: Validate `launchWalletSelection.bundleWallets.length === draft.data.walletCount`, every `buyAmountSol === draft.data.solPerWallet`, and every wallet object is sanitized before preview creation.

### 5. Imported wallet public labels are derived from private-key suffixes

- Verdict: CONFIRMED
- Impact: MED
- Confidence: 0.95
- Ranking score: 1.90
- Files:
  - `src/lib/wallet-roster.ts:138`
  - `tests/unit/wallet-roster.test.ts:27`
  - `tests/unit/wallet-roster.test.ts:36`
- Evidence:
  - ``pubkey: `Imported...${privateKey.slice(-4)}`,``
- Description: Imported wallets do not derive real public keys. They create a display/public label from the last four characters of the private key. That derived value can be sent to `/api/chat` as `pubkey`.
- Skeptic cross-check: This is low-entropy and not a full private-key leak, but it violates the stricter project rule that backend data should not be derived from private keys.
- Recommendation: Use neutral labels such as `Imported wallet 1` until a real client-side public-key derivation library is available, or keep imported wallets out of backend previews until public keys are known.

### 6. Insufficient bundle-wallet count fails as a generic chat route error

- Verdict: CONFIRMED
- Impact: MED
- Confidence: 0.92
- Ranking score: 1.84
- Files:
  - `src/components/smithii-agent-app.tsx:102`
  - `src/components/smithii-agent-app.tsx:661`
  - `src/lib/wallet-roster.ts:102`
- Evidence:
  - `launchWalletSelection: launchSelectionForDraft(draft, walletRoster),`
  - `throw new Error("Not enough bundle wallets are available.");`
- Description: The chat permits `1-15` bundle wallets, but the default roster has only four bundle wallets. Once `walletCount` and `solPerWallet` are collected, `launchSelectionForDraft` can throw while building the fetch body, causing the generic catch message: `The mock chat route failed.`
- Recommendation: Catch this specific client-side error before `fetch` and show an actionable assistant message asking the user to add or import enough wallets.

### 7. Locked launch metadata constraints are not enforced

- Verdict: CONFIRMED for description length and URL prefixes; PARTIAL for image dimensions
- Impact: MED
- Confidence: 0.88
- Ranking score: 1.76
- Files:
  - `src/lib/smithii/types.ts:13`
  - `src/lib/agent/mock-chat.ts:288`
  - `src/lib/agent/mock-chat.ts:334`
  - `src/lib/agent/mock-chat.ts:371`
  - `PLAN.md:84`
- Evidence:
  - `description: string;`
  - `nextDraft.data.description = rawMessage;`
  - image validation only checks filename extension
- Description: The locked plan requires description length `<=250` and specific social URL prefixes. The implementation accepts arbitrary descriptions and social URLs, with only `.png/.jpg/.jpeg` filename validation.
- Recommendation: Add tests and lightweight validation for description length and URL prefixes. Defer pixel-dimension validation until real `File` handling exists.

### 8. Client keeps stale previews after backend clears them

- Verdict: CONFIRMED
- Impact: MED
- Confidence: 0.88
- Ranking score: 0.88
- Files:
  - `src/components/smithii-agent-app.tsx:115`
  - `src/lib/agent/mock-chat.ts:223`
  - `src/lib/agent/mock-chat.ts:238`
  - `src/lib/agent/mock-chat.ts:252`
- Evidence:
  - `setActivePreview(result.activePreview ?? activePreview);`
  - execution paths return `activePreview: null`
- Description: After execution or expiry, the backend returns `activePreview: null`, but the UI keeps the previous preview visible. The execution panel can then show a stale preview plan ID even though `pendingPlan` is cleared.
- Skeptic cross-check: Keeping historical context may be intentional, and execution still depends on `pendingPlan`, so this is not an execution-safety bug.
- Recommendation: Distinguish “no new preview” from “clear current preview” with an explicit response field, or clear preview on execution/expiry statuses while preserving an optional history section later.

### 9. Bundle Swap never emits documented `skip_no_sol_for_fees`

- Verdict: CONFIRMED
- Impact: MED
- Confidence: 0.90
- Ranking score: 1.80
- Files:
  - `src/lib/smithii/mock.ts:79`
  - `src/lib/smithii/mock.ts:80`
  - `PLAN.md:155`
- Evidence:
  - `status: input.direction !== "sol_to_token" && wallet.tokenBalance <= 0 ? "skip_no_token" : "ready"`
- Description: The plan includes `skip_no_sol_for_fees`, but the mock can only return `ready` or `skip_no_token`.
- Recommendation: Either add a fee-buffer rule once the Smithii fee payer model is clarified, or mark this status as deferred/removed from the current mock contract.

### 10. Volume Bot type allows `sell_strategy` without `sellStrategy`

- Verdict: CONFIRMED
- Impact: MED
- Confidence: 0.94
- Ranking score: 1.88
- Files:
  - `src/lib/smithii/types.ts:62`
  - `src/lib/smithii/types.ts:63`
  - `PLAN.md:183`
- Evidence:
  - `sellMode: "sell_strategy" | "sell_100";`
  - `sellStrategy?: {`
- Description: The plan says `sellStrategy` is required when `sellMode === "sell_strategy"`, but the TypeScript type permits the invalid shape.
- Recommendation: Convert `VolumeBotInput` to a discriminated union so `sellStrategy` is required for `sell_strategy` and absent/optional for `sell_100`.

### 11. `/api/chat` has no direct route tests

- Verdict: CONFIRMED
- Impact: MED
- Confidence: 0.90
- Ranking score: 1.80
- Files:
  - `src/app/api/chat/route.ts:19`
  - `tests/unit/mock-agent.test.ts:7`
  - `tests/unit/wallet-roster.test.ts:14`
  - `tests/unit/smithii-tools.test.ts:19`
- Evidence:
  - Existing tests cover pure libraries only; no test imports or calls the route handler.
- Description: HTTP parsing, invalid JSON handling, request-shape validation, and response serialization are untested at the actual backend boundary.
- Recommendation: Add focused route tests for empty message `400`, malformed JSON `400`, valid preview response shape, forged pending plan rejection, unknown tool rejection, and private-key echo prevention.

### 12. Global settings pass-through is not locked for Bundle Swap or Volume Bot

- Verdict: CONFIRMED coverage gap
- Impact: MED
- Confidence: 0.88
- Ranking score: 1.76
- Files:
  - `tests/unit/mock-agent.test.ts:185`
  - `tests/unit/mock-agent.test.ts:243`
  - `tests/unit/mock-agent.test.ts:254`
  - `src/lib/agent/mock-chat.ts:632`
  - `src/lib/agent/mock-chat.ts:680`
- Description: The implementation currently threads global settings through all preview kinds, but tests only assert non-default settings for Bundle Launch.
- Recommendation: Add two tests that pass non-default `globalSettings` into swap and volume intents and assert the returned preview includes them.

### 13. Invalid JSON request bodies are not handled by the route

- Verdict: CONFIRMED by static verification; local runtime smoke timed out
- Impact: LOW
- Confidence: 0.82
- Ranking score: 0.82
- Files:
  - `src/app/api/chat/route.ts:19`
  - `src/app/api/chat/route.ts:20`
- Evidence:
  - `const body = (await request.json()) as ChatRequest;`
- Description: `request.json()` is outside `try/catch`, so malformed request bodies do not return a controlled `{ error }` response. A local malformed-JSON smoke timed out after 5 seconds, increasing concern but not giving a clean status-code observation.
- Recommendation: Catch JSON parse errors and return `400` with `{ error: "Invalid JSON." }`.

### 14. Phase 2 global settings persistence is not implemented

- Verdict: PARTIAL
- Impact: MED
- Confidence: 0.82
- Ranking score: 0.82
- Files:
  - `PLAN.md:351`
  - `src/components/smithii-agent-app.tsx:71`
- Evidence:
  - `const [globalSettings, setGlobalSettings] = useState<GlobalSettings>(defaultGlobalSettings);`
- Description: PLAN Phase 2 DoD says global settings persist per session. Current state is React memory only. Current repo docs still frame the tracker as Phase 1, so this is acceptance drift only if Phase 2 is being declared complete.
- Recommendation: Either add session persistence and a browser/component test, or mark persistence as an explicit open Phase 2 item.

### 15. Exported demo wallet CSV cannot be imported back

- Verdict: PARTIAL
- Impact: MED
- Confidence: 0.90
- Ranking score: 0.90
- Files:
  - `src/lib/wallet-roster.ts:148`
  - `src/lib/wallet-roster.ts:152`
  - `tests/unit/wallet-roster.test.ts:68`
- Evidence:
  - `return ["privateKey", ...roster.map((wallet) => wallet.privateKey)].join("\n");`
  - `/^[1-9A-HJ-NP-Za-km-z]{32,128}$/.test(value)`
- Description: The default demo private keys contain hyphens and fail the importer’s base58 shape check, so exporting the default roster and importing it back fails.
- Recommendation: Use valid mock base58-shaped demo keys or label demo exports separately.

### 16. Chat rejects zero bundle wallets while the plan says `0..15`

- Verdict: CONFIRMED
- Impact: LOW
- Confidence: 0.90
- Ranking score: 0.90
- Files:
  - `src/lib/agent/mock-chat.ts:292`
  - `src/lib/agent/mock-chat.ts:302`
  - `PLAN.md:101`
- Evidence:
  - `"How many bundle wallets should buy? Use 1-15."`
  - `walletCount < 1 ||`
- Description: The locked plan says Bundle Launch supports `0..15` bundle wallets, but chat collection requires `1..15`.
- Recommendation: Decide whether dev-only launch is supported. If yes, allow `0`; if no, update the plan to `1..15`.

## Partial And Unverified Findings

- Bundle Launch dev-wallet fee preview omits `dev_buy`: PARTIAL. The plan comment says `+ dev_buy`, but no concrete dev-buy input exists in the locked schema.
- Volume Bot total estimate conflicts with Appendix B sample: UNVERIFIED. The sample implies a much lower total than the implementation formula, but Section 4 does not define the authoritative formula.
- Phase 2 settings persistence: PARTIAL because Phase 2 has not been explicitly marked complete in repo docs.
- Demo CSV round-trip: PARTIAL because real imported base58-shaped keys round-trip; the break is specific to built-in demo keys.

## Design Choices

- Internal camelCase DTOs vs snake_case plan schema: DESIGN_CHOICE for now. Add a Smithii-facing adapter before Phase 8 rather than renaming all React/internal state now.
- Bundle Swap routing hard-coded to `pumpfun_bonding`: DESIGN_CHOICE in the mock phase. Real token-state detection is planned later.
- Bundle Swap `per_tx_overrides` omitted: DESIGN_CHOICE/deferred functionality because the current swap UI is still a stub.
- Mock-first deterministic execution: DESIGN_CHOICE and aligned with `README.md`, `AGENTS.md`, and `PHASE1_TICKETS.md`.
- Keeping last preview visible: confirmed as stale-state UX, but not an execution-safety bug because `pendingPlan` gates execution.

## Disputed Findings

No verifier returned a `DISPUTED` verdict. Several findings were downgraded to `PARTIAL`, `DESIGN_CHOICE`, or `UNVERIFIED`.

## Dead Code

No confirmed dead code findings. The aborted sixth researcher would have covered config/dead-code in parallel, so the main agent performed a local config/reachability pass over root config and route wiring instead.

## Coverage Gaps

- No git history was available; targeted git-history checks could not be performed.
- No browser Playwright run was performed during SMAC; runtime checks used direct HTTP requests against the local dev server.
- No generated/vendor artifacts were audited.
- No live Smithii, Solana RPC, wallet adapter, Supabase, Upstash, Sentry, or AI SDK integrations exist yet, so they were outside runtime scope.
- The agent limit allowed five domain researchers plus one Skeptic. A sixth config/dead-code researcher was closed and replaced by the Skeptic to preserve the required one-Skeptic structure.

## Run Stats

- Researchers dispatched: 5 usable domain researchers
- Skeptic reports: 1
- Verifiers dispatched: 5
- Verifiers succeeded: 5
- Findings considered before merge: 23
- Ranked merged findings: 16
- Confirmed: 12
- Partial: 4
- Design choices: 4
- Disputed: 0
- Dead code: 0
- Unverified: 1
- Rubber-stamp verification detected: no

## Confirmed Cleanup Backlog

### 1. Harden `/api/chat` request boundaries and private-key rejection

- Category: error-handling
- Exact files in scope:
  - `src/app/api/chat/route.ts`
  - `src/lib/agent/mock-chat.ts`
  - new or existing route tests under `tests/unit`
- Recommended write owner or work package: Backend/API boundary hardening
- Verification command or check:
  - Add tests for private-key rejection/no echo, forged pending plan rejection, unknown tool rejection, invalid JSON `400`, empty message `400`
  - Run `pnpm test`, `pnpm lint`, `pnpm build`
- Dependencies on other findings: Covers findings 1, 2, 3, 4, 11, and 13
- Safe to batch with adjacent work: yes, batch as one API-boundary patch

### 2. Remove private-key-derived imported wallet labels

- Category: strong-types
- Exact files in scope:
  - `src/lib/wallet-roster.ts`
  - `tests/unit/wallet-roster.test.ts`
- Recommended write owner or work package: Wallet roster browser-boundary hardening
- Verification command or check:
  - Add/update tests proving imported labels do not contain private-key substrings and launch selections contain only public fields
  - Run `pnpm test`
- Dependencies on other findings: Related to API private-key hardening, but can be done independently
- Safe to batch with adjacent work: yes, safe with route-boundary tests

### 3. Surface insufficient wallet roster errors before fetch

- Category: error-handling
- Exact files in scope:
  - `src/components/smithii-agent-app.tsx`
  - optional helper tests if component test infrastructure is added
- Recommended write owner or work package: Frontend chat UX hardening
- Verification command or check:
  - Manual browser or component check: request more wallets than loaded and verify an actionable message appears without route-failure copy
  - Run `pnpm lint`, `pnpm build`
- Dependencies on other findings: none
- Safe to batch with adjacent work: yes, but separate from backend sanitizer if minimizing UI/API churn

### 4. Add launch metadata validation

- Category: error-handling
- Exact files in scope:
  - `src/lib/agent/mock-chat.ts`
  - `tests/unit/mock-agent.test.ts`
  - possibly `src/lib/smithii/mock.ts` if validation belongs at prepare layer
- Recommended write owner or work package: Launch parameter validation
- Verification command or check:
  - Tests for >250 description and invalid website/Telegram/X prefixes
  - Run `pnpm test`
- Dependencies on other findings: decide image-dimension deferral first
- Safe to batch with adjacent work: yes, with other launch-flow tests

### 5. Strengthen Volume Bot `sellStrategy` type

- Category: strong-types
- Exact files in scope:
  - `src/lib/smithii/types.ts`
  - `tests/unit/smithii-tools.test.ts`
- Recommended write owner or work package: Smithii contract typing
- Verification command or check:
  - Add compile/type-level or runtime tests for invalid `sell_strategy` without strategy
  - Run `pnpm test`, `pnpm build`
- Dependencies on other findings: none
- Safe to batch with adjacent work: yes, with other contract validations

### 6. Add missing global-settings preview tests

- Category: strong-types
- Exact files in scope:
  - `tests/unit/mock-agent.test.ts`
- Recommended write owner or work package: Test coverage hardening
- Verification command or check:
  - Add swap and volume non-default `globalSettings` assertions
  - Run `pnpm test`
- Dependencies on other findings: none
- Safe to batch with adjacent work: yes

### 7. Resolve Bundle Swap `skip_no_sol_for_fees` contract gap

- Category: strong-types
- Exact files in scope:
  - `src/lib/smithii/types.ts`
  - `src/lib/smithii/mock.ts`
  - `tests/unit/smithii-tools.test.ts`
  - `PLAN.md` only if product decision changes
- Recommended write owner or work package: Bundle Swap contract alignment
- Verification command or check:
  - Either add a fee-buffer test that emits `skip_no_sol_for_fees`, or update the plan to defer/remove that status
  - Run `pnpm test`
- Dependencies on other findings: requires product decision about who pays per-wallet fees
- Safe to batch with adjacent work: no, wait for fee-payer clarification

