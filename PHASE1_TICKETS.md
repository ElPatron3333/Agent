# Phase 1 Tickets

Goal: create a runnable local Smithii Agent scaffold without requiring production API keys.

## P1-01 Project scaffold

Acceptance:
- Next.js App Router project runs locally with TypeScript strict mode.
- Tailwind is available for UI styling.
- Existing `PLAN.md` remains untouched.

Verify:
- `pnpm lint`
- `pnpm build`

## P1-02 Mock Smithii domain layer

Acceptance:
- Shared TypeScript types mirror `PLAN.md` section 4 for Bundle Launch, Bundle Swap, and Volume Bot.
- Mock prepare/execute functions return deterministic previews and fake execution IDs.
- No private-key field exists in server-side types.

Verify:
- Unit tests cover fee math, wallet limits, and confirmation-safe stubs.

## P1-03 Local app shell

Acceptance:
- First screen is the usable app, not a marketing page.
- UI exposes chat, tool preview, wallet/global settings placeholders, and mock execution status.
- Missing external keys do not block local startup.

Verify:
- `pnpm dev` opens a working local app.

## P1-04 Documentation and env placeholders

Acceptance:
- `.env.example` lists future keys as optional.
- `README.md` explains local setup and the current stubbed execution model.

Verify:
- Fresh clone can install and run without real service keys.

## Phase gate

Before starting the next phase, run a SMAC/code-audit pass and resolve or explicitly defer confirmed findings.
