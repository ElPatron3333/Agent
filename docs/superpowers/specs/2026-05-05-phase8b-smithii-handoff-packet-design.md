# Phase 8B Smithii Handoff Packet Design

Date: 2026-05-05
Branch: feature/phase8b-smithii-handoff-packet
Status: approved for implementation as a documentation/contract phase.

## Goal

Create a concise Smithii handoff packet that turns Phase 8A's scattered blockers into a single document the Smithii team can answer directly. This phase must not wire live Smithii execution or weaken the zero-custody boundary.

## Scope

Phase 8B produces documentation only:

- A sendable question packet for Smithii.
- A short repo status document explaining how Phase 8B gates later live execution.
- Cross-links from the existing plan and Smithii spike docs.
- A written implementation plan record for traceability.

Out of scope:

- Calling Smithii live APIs.
- Adding `execute_*` live handlers.
- Adding backend private-key schemas.
- Changing runtime behavior.

## Design

The packet should be structured so Smithii can answer each section without reading the whole repository. It starts with non-negotiable constraints, then asks for concrete contracts by flow: shared handoff/auth, Bundle Launch, Bundle Swap, Volume Bot, Launch + Volume sequence, status lifecycle, service fees, sandbox testing, and operations.

Each question should include why we need the answer and what type of response is expected: API signature, enum mapping, lifecycle description, limit, or yes/no plus alternative. Exact SDK private-key argument names may appear only in this internal packet/spike context; public `/api/chat` response metadata must keep neutral signer-material labels.

## Verification

Because Phase 8B is docs-only, verification is repository readiness plus document review:

- `pnpm test`
- `pnpm lint`
- `pnpm build`
- `git diff --check`
- Search for placeholder language such as `T[B]D`, `TO[D]O`, and `? ? ?` in the new docs.

## Success Criteria

- The Smithii team can answer the packet directly and unblock or reject each live execution path.
- The packet preserves the zero-custody boundary: backend never receives or logs private keys.
- The docs make it clear that `browser-handoff-ready` means known SDK target, not production live execution.
- Phase 8C can begin only after Smithii answers enough of the packet to define a zero-custody browser handoff contract.