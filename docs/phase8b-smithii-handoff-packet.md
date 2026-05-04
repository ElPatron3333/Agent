# Phase 8B: Smithii Handoff Packet

Date: 2026-05-05
Branch: feature/phase8b-smithii-handoff-packet
Status: documentation/contract phase complete; live execution remains disabled.

## Purpose

Phase 8B converts the Phase 8A Smithii blockers into a single handoff packet that can be sent to Smithii. It does not change runtime behavior and does not wire live execution.

Canonical packet: `docs/smithii-integration-questions.md`

## What Changed

- Added a sendable Smithii integration question packet.
- Added this Phase 8B status document.
- Added a design record and implementation plan under `docs/superpowers/`.
- Cross-linked existing roadmap docs to the canonical packet.

## Current Execution State

The app remains mock-first:

- `/api/chat` prepares previews and signs local pending plans.
- Mock confirmation still returns deterministic mock outputs.
- `src/lib/smithii/live-boundary.ts` still blocks backend live execution.
- Public response metadata still uses neutral signer-material labels.
- No live Smithii SDK call is made by this phase.

## Phase 8C Gate

Phase 8C should not start until Smithii answers enough of `docs/smithii-integration-questions.md` to define at least one safe zero-custody browser handoff.

Minimum answers required for any live flow:

1. Browser module/API shape.
2. Auth/license model and server-issued fields.
3. Idempotency and duplicate confirmation behavior.
4. Success/error/result contract.
5. Service fee enforcement and proof fields.
6. Sandbox or approved low-amount mainnet test procedure.
7. Confirmation that our backend never needs private keys or private-key-shaped payloads.

If Smithii answers only a subset of flows, the app should enable only that subset and keep all other flows blocked.

## Related Docs

- `docs/smithii-integration-questions.md`
- `docs/phase8a-live-boundary.md`
- `docs/smithii-sdk-spike.md`
- `PLAN.md`
- `docs/superpowers/specs/2026-05-05-phase8b-smithii-handoff-packet-design.md`
- `docs/superpowers/plans/2026-05-05-phase8b-smithii-handoff-packet.md`

## Verification

Phase 8B verification:

- `pnpm test`
- `pnpm lint`
- `pnpm build`
- `git diff --check`
- Placeholder scan for `T[B]D`, `TO[D]O`, and `? ? ?` in the Phase 8B docs