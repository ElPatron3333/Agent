# Phase 6 Post-Fix SMAC

Date: 2026-05-01T00:07:01+03:00
Branch: `feature/phase6-multistep-templates`
Commits audited:

- `40c110e Add phase 6 multistep templates`
- `69bdf5d Fix phase 6 audit findings`

Mode: `general`, focused closure audit
Coverage: single-thread fallback. Sub-agent delegation was not used because it was not explicitly authorized in this turn.

## Scope

Focused follow-up on the prior Phase 6 SMAC findings from `docs/smac-reports/2026-04-30-smithii-agent-phase6-multistep-templates-smac.md`.

Prior findings checked:

1. UI did not send selected volume wallet for top-level launch + volume requests.
2. Last-config memory was display-only and could not apply the last config.
3. Sequence pending plans lacked route-level replay coverage.

## Verification Commands

Run from `D:\smithii-agent\.worktrees\phase6-multistep-templates`:

```text
pnpm test tests/unit/client-chat-state.test.ts tests/unit/mock-agent.test.ts tests/unit/chat-route.test.ts -> 3 files, 55 tests passed
pnpm test  -> 9 files, 99 tests passed
pnpm lint  -> passed
pnpm build -> passed
```

## Closure Results

### 1. UI sequence volume-wallet selection

- Prior severity: HIGH
- Follow-up verdict: CLOSED
- Evidence:
  - `src/components/smithii-agent-app.tsx:169` now passes `trimmed` into `volumeSelectionForDraft` when constructing the chat request.
  - `src/components/smithii-agent-app.tsx:1217` now allows a selected public volume wallet for either a `volume_bot` draft or a top-level message matching launch + volume intent.
  - `tests/unit/chat-route.test.ts:710` verifies the full route accepts a launch + volume sequence with a public `volumeWalletSelection`, signs it, executes it once, and rejects replay.
- Residual risk: no DOM-level browser test exists for the form submit helper, but the code path is small and route-level coverage now covers the signed plan boundary.

### 2. Last-sequence reuse

- Prior severity: MED
- Follow-up verdict: CLOSED
- Evidence:
  - `src/components/smithii-agent-app.tsx:325` now wires a `Reuse sequence` button to `inputForLastConfig(lastSequenceConfig)`.
  - `src/components/smithii-agent-app.tsx:260` only stores previews whose kind is `launch_volume_sequence`.
  - `src/lib/agent/client-chat-state.ts:46` builds a reusable launch + volume prompt from a saved `launch_volume_sequence` snapshot.
  - `src/lib/agent/last-config-memory.ts` exposes `readStoredLastSequenceConfig`, which returns `null` for non-sequence saved configs.
  - `tests/unit/client-chat-state.test.ts:68` verifies the saved launch + volume snapshot becomes a valid sequence prompt.
  - `tests/unit/mock-agent.test.ts:925` verifies the compact repeat form for a saved launch + volume config prepares a sequence preview.
  - `tests/unit/last-config-memory.test.ts` verifies sequence-only reads reject saved Bundle Launch configs.
- Residual issue: none for Phase 6 scope. Reuse is intentionally scoped to launch + volume sequences.

### 3. Sequence pending-plan route replay coverage

- Prior severity: LOW
- Follow-up verdict: CLOSED
- Evidence:
  - `tests/unit/chat-route.test.ts:710` prepares a route-issued `launch_volume_sequence` pending plan.
  - `tests/unit/chat-route.test.ts:735` confirms it once successfully.
  - `tests/unit/chat-route.test.ts:750` replays the same signed pending plan and verifies `400` with `Invalid pending plan.`
- Residual risk: none specific to sequence replay; it now uses the same route-level one-time consumption path as the other tools.

## Ranked Findings

No remaining findings after the sequence-only scope fix.

## Disagreements

- BullMQ remains unwired. This is still a DESIGN_CHOICE for the mock/local phase, not a confirmed defect.
- Deterministic mock execution remains a DESIGN_CHOICE under the Smithii library blocker.

## Dead Code

- None confirmed.

## Disputed Findings

- None.

## Coverage Gaps

- No browser automation or DOM-level test was run.
- Single-thread fallback means there was no independent multi-agent verifier coverage.
- Follow-up scope was limited to prior Phase 6 SMAC findings, not a new whole-branch audit.

## Run Stats

- Prior findings checked: 3
- Prior findings closed: 3
- Prior findings partial: 0
- New findings total: 0
- Confirmed: 0
- Partial: 0
- Disputed: 0
- Design choices: 2
- Dead code: 0

## Confirmed Cleanup Backlog

No eligible cleanup-orchestrator items.

## Handoff

- Phase 6 post-fix SMAC findings are closed.
- Next step: commit this follow-up report and final scope fix, then run readiness/merge workflow.
