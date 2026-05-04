# Phase 8B Smithii Handoff Packet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a sendable Smithii integration handoff packet that consolidates the Phase 8A blockers without wiring live execution.

**Architecture:** Keep Phase 8B docs-only. Add a canonical Smithii question packet, a short phase status document, and cross-links from existing roadmap docs. Preserve the Phase 8A zero-custody boundary and do not change application runtime behavior.

**Tech Stack:** Markdown documentation, existing Next.js/TypeScript repository verification with `pnpm test`, `pnpm lint`, `pnpm build`, and `git diff --check`.

---

### Task 1: Create the Sendable Smithii Packet

**Files:**
- Create: `docs/smithii-integration-questions.md`

- [x] **Step 1: Draft non-negotiable constraints**

Add the zero-custody backend rule, explicit confirmation requirement, mock-first status, and the meaning of `browser-handoff-ready`.

- [x] **Step 2: Draft shared handoff questions**

Ask for browser-side transaction assembly API shape, auth/license model, idempotency, sandbox, status lifecycle, service fee proof fields, and error semantics.

- [x] **Step 3: Draft flow-specific questions**

Add sections for Bundle Launch, Bundle Swap, Volume Bot, and Launch + Volume sequence. Each question includes why the answer is needed and the expected answer shape.

- [x] **Step 4: Add acceptance gates**

Document what answers are required before Phase 8C can wire any live browser handoff.

### Task 2: Create the Phase 8B Status Document

**Files:**
- Create: `docs/phase8b-smithii-handoff-packet.md`

- [x] **Step 1: Summarize the phase**

Document that Phase 8B is a documentation/contract phase and live execution remains disabled.

- [x] **Step 2: Add repository links**

Point to the canonical packet, Phase 8A boundary, SDK spike, and PLAN open items.

- [x] **Step 3: Add next-phase gates**

State that Phase 8C can start only after Smithii provides enough answers for a zero-custody browser handoff.

### Task 3: Cross-Link Existing Roadmap Docs

**Files:**
- Modify: `PLAN.md`
- Modify: `docs/phase8a-live-boundary.md`
- Modify: `docs/smithii-sdk-spike.md`

- [x] **Step 1: Add Phase 8B references**

Point existing Smithii blockers to `docs/smithii-integration-questions.md` so the canonical question source is clear.

- [x] **Step 2: Preserve blocked execution wording**

Keep the existing statement that real Smithii execution remains blocked until a browser-side zero-custody handoff contract exists.

### Task 4: Verify

**Files:**
- No runtime files expected.

- [x] **Step 1: Placeholder scan**

Run: `rg -n "T[B]D|TO[D]O|\?\?\?" docs/smithii-integration-questions.md docs/phase8b-smithii-handoff-packet.md docs/superpowers/specs/2026-05-05-phase8b-smithii-handoff-packet-design.md docs/superpowers/plans/2026-05-05-phase8b-smithii-handoff-packet.md`

Expected: no matches.

- [x] **Step 2: Full verification**

Run: `pnpm test`, `pnpm lint`, `pnpm build`, and `git diff --check`.

Expected: all pass.