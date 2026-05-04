# SMAC Report: Smithii Agent Phase 8B Handoff Packet

Date: 2026-05-05
Mode: architecture/docs
Scope: Phase 8B Smithii handoff packet and related roadmap links
Coverage: single-thread fallback with explicit role separation
Baseline commit: 21a0688 Add phase 8B Smithii handoff packet

## Ranked Findings

### 1. CONFIRMED MED - Canonical Smithii packet does not explicitly preserve every PLAN open item

Score: 1.8
Category: comment-slop

Evidence:

- `docs/smithii-integration-questions.md:12` says the packet is the canonical list of Smithii answers required before Phase 8C live browser handoff.
- `PLAN.md:375` still asks for failed-launch refund/recovery semantics, especially the 0.10 SOL service fee.
- `PLAN.md:380` still asks whether `AntiMEVSingleConfig.randomize` is only per-bundle direction randomization and not amount/delay randomization.
- `docs/smithii-integration-questions.md:79`, `docs/smithii-integration-questions.md:175`, `docs/smithii-integration-questions.md:217`, and `docs/smithii-integration-questions.md:269` cover fee failures, rollback, refund, and safe test expectations generically, but do not explicitly preserve the failed-launch/service-fee wording from `PLAN.md:375`.
- Targeted search found no `randomize` or `AntiMEVSingleConfig` reference in the canonical packet.

Why this matters:

The packet is meant to be sendable to Smithii as the canonical blocker list. If it omits or only indirectly covers roadmap blockers, Smithii can answer the packet while leaving a known Phase 8 blocker unresolved. This is a docs-contract issue, not a runtime bug, because Phase 8B did not enable live execution.

Why this might be wrong:

The existing generic refund, rollback, and Volume Bot field-mapping questions may be enough for a live meeting. However, the packet's purpose is canonical written handoff, and the missing `randomize` item is not discoverable from the packet text.

Recommendation:

Add explicit packet questions for:

- Bundle Launch failed-launch refund/recovery semantics, including whether the 0.10 SOL service fee is charged, refunded, credited, or requires manual recovery.
- `AntiMEVSingleConfig.randomize` semantics, specifically whether it means direction randomization only or also amount/delay randomization.

Optionally add a short mapping checklist from `PLAN.md` open items to packet sections so future audits can prove coverage quickly.

## Disagreements

None. The single confirmed finding survived the conservative counterargument because the packet declares itself canonical while omitting at least one exact open item.

## Design Choices

### LOW/WATCH - Phase 8B says complete before this SMAC report existed

Evidence:

- `docs/phase8b-smithii-handoff-packet.md:5` marks Phase 8B documentation/contract work complete.
- `docs/phase8b-smithii-handoff-packet.md:55` lists Phase 8B verification commands but does not include the Phase 8B SMAC report artifact.

Verdict:

Design choice / artifact timing issue. No cleanup is required by itself because this report closes the missing audit artifact gap.

## Dead Code

None found. Phase 8B is documentation-only and did not add runtime code paths.

## Disputed Findings

None.

## Coverage Gaps

- This was a single-thread fallback. No spawned researcher or verifier agents were used in this turn, so the report does not claim multi-agent coverage.
- The audit focused on Phase 8B docs and handoff-contract completeness, not a full runtime re-audit of earlier phases.
- Smithii has not answered the packet yet, so live integration correctness remains blocked on external contract details.

## Run Stats

- Usable researcher roles simulated: 7
  - docs contract coverage
  - zero-custody/security wording
  - Smithii flow completeness
  - release/readiness gates
  - test/verification coverage
  - conservative scope reviewer
  - Skeptic
- Usable verifier roles simulated: 1 main-thread verifier pass
- Findings total: 1
- Confirmed: 1
- Partial: 0
- Disputed: 0
- Design choice/watch: 1
- Dead code: 0

## Confirmed Cleanup Backlog

### Canonical packet missing explicit PLAN open-item coverage

Category: comment-slop

Files in scope:

- `docs/smithii-integration-questions.md`
- `docs/phase8b-smithii-handoff-packet.md` if adding status or verification notes
- `PLAN.md` only if adding a backlink or coverage note

Recommended write owner / work package:

Docs-contract owner. Add the missing explicit questions and, if useful, a compact mapping note that proves `PLAN.md` Smithii open items are represented in the canonical packet.

Verification command or check:

- `rg -n "AntiMEVSingleConfig|randomize|failed-launch|0.10 SOL|refund|recovery" docs/smithii-integration-questions.md PLAN.md`
- `pnpm test`
- `pnpm lint`
- `pnpm build`
- `git diff --check`

Dependencies:

None.

Safe to batch:

Yes. This can be batched with adjacent Phase 8B docs cleanup, but should stay docs-only.

## Terminal Summary

Phase 8B did need a SMAC. The audit found one confirmed documentation-contract gap: the canonical Smithii handoff packet should explicitly include every unresolved Smithii open item from `PLAN.md`, especially failed-launch service-fee refund/recovery and `AntiMEVSingleConfig.randomize` semantics. No runtime defect or dead code was found.
