# Phase 6 Multi-step + Templates SMAC

Date: 2026-04-30T23:59:12+03:00
Branch: `feature/phase6-multistep-templates`
Commit audited: `40c110e Add phase 6 multistep templates`
Mode: `general`
Coverage: single-thread fallback. Sub-agent delegation was not used because it was not explicitly authorized in this turn.

## Scope

Audited the Phase 6 diff only: launch-to-volume sequencing, named templates, signed pending-plan support for `launch_volume_sequence`, UI preview rendering, local last-config memory, and tests.

## Research Roles Simulated

- Confirmation gate and route-boundary reviewer
- UI data-flow reviewer
- Template and preview math reviewer
- Local persistence / cross-session memory reviewer
- Zero-custody and mock-first boundary reviewer
- Conservative test-coverage reviewer
- Skeptic reviewer for mock-phase false positives

## Ranked Findings

### 1. UI does not send the selected volume wallet for top-level launch + volume requests

- Severity: HIGH
- Verdict: CONFIRMED
- File: `src/components/smithii-agent-app.tsx:168`
- File: `src/components/smithii-agent-app.tsx:1203`
- File: `src/lib/agent/mock-chat.ts:465`
- Evidence: the request body calls `volumeSelectionForDraft(draft, activeVolumeWalletPubkey)`, but `volumeSelectionForDraft` returns `null` unless `draft?.tool === "volume_bot"`. Phase 6 sequence requests are top-level chat intents with `draft === null`, so the route sends no `volumeWalletSelection`. The agent then follows the missing-wallet branch and returns `Select a Volume Bot wallet before previewing a launch + volume sequence.`
- Impact: the browser quick-action and natural-language Phase 6 path cannot produce the intended sequence preview even when a volume wallet is selected in the roster.
- Why this might be wrong: direct unit tests for `handleMockChat` pass when a caller manually supplies `volumeWalletSelection`, but those tests bypass the real browser request construction.
- Recommendation: make the UI send a selected public volume wallet for sequence intents as well as in-progress volume drafts, and add a test that covers that selection helper behavior.

### 2. Last-config memory is display-only and cannot apply the last config

- Severity: MED
- Verdict: CONFIRMED
- File: `src/components/smithii-agent-app.tsx:258`
- File: `src/components/smithii-agent-app.tsx:312`
- File: `src/lib/agent/last-config-memory.ts:3`
- Evidence: Phase 6 stores only `{ kind, label, templateId, updatedAt }`, renders it in the sidebar, and never sends it to the chat route or uses it to seed the input. `rg "same setup|lastConfig" src tests -n` finds no consumer that can apply the remembered config.
- Impact: the implementation does not yet satisfy the plan's "Cross-session memory of last config" intent beyond a passive label. A user cannot ask for or reload the last configuration.
- Why this might be wrong: for the current mock-first UI, a visible persisted snapshot may be considered a first slice of memory, not the full conversational reuse behavior.
- Recommendation: either add a minimal reuse affordance that seeds the chat input from the saved config, or explicitly narrow Phase 6 wording to "last config snapshot" until full reuse is implemented.

### 3. Sequence pending plans lack route-level replay coverage

- Severity: LOW
- Verdict: PARTIAL
- File: `src/app/api/chat/route.ts:60`
- File: `tests/unit/mock-agent.test.ts:904`
- Evidence: `launch_volume_sequence` is allowed by the route signing set and has helper-level confirmation tests, but there is no route-level test showing a signed sequence plan can be confirmed once and rejected on replay.
- Impact: existing generic route code likely protects the new plan type, but previous phase audits found confirmation bugs only at the route boundary.
- Why this might be wrong: `PendingPlan["tool"]` and the shared route code make this mostly covered by existing tests for other tools.
- Recommendation: add a route-level once-only confirmation test for a sequence plan when touching this area next.

## Disagreements

- BullMQ is not wired in this branch. This is a DESIGN_CHOICE, not a defect, because the repo is still local-first/mock-first and has no Redis/BullMQ foundation yet. Adding production queue infrastructure here would be broader than the current architecture supports.
- Deterministic mock mint/signature/status values are DESIGN_CHOICE under the established mock-first Smithii boundary.

## Dead Code

- None confirmed.

## Disputed Findings

- No disputed findings after skeptic review.

## Coverage Gaps

- No browser automation was run during this SMAC pass.
- Single-thread fallback means there was no independent multi-agent verifier coverage.
- The audit inspected Phase 6 code paths only, not the whole repo.

## Run Stats

- Researchers simulated: 6 plus 1 skeptic
- Verifiers simulated: 3 verification passes in main thread
- Findings total: 3
- Confirmed: 2
- Partial: 1
- Design choices: 2
- Disputed: 0
- Dead code: 0

## Confirmed Cleanup Backlog

No findings map cleanly to the cleanup-orchestrator categories. The confirmed items are feature-completeness/route-coverage issues rather than cleanup backlog items.

## Handoff

- Fix finding 1 before considering Phase 6 ready.
- Decide whether finding 2 should be fixed now as a minimal reuse affordance or deferred as an explicitly narrowed memory snapshot.
- Add route-level sequence replay coverage when the route boundary is next changed.
