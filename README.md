# Smithii Agent

Conversational Pump.fun execution layer for Smithii Pro.

Phase 1 is local-first. The app runs with mocked Smithii execution, mocked chat content, and optional environment keys. Real execution stays blocked until Smithii provides the browser-side transaction assembly library and integration terms described in `PLAN.md`.

## Current Scope

- Bundle Launch preview and mock execute
- Bundle Swap preview
- Volume Bot preview
- Browser-only private-key rule preserved in types and docs
- No required production API keys for local development

## Local Setup

```powershell
pnpm install
pnpm dev
```

Open the local URL printed by Next.js.

## Verification

```powershell
pnpm test
pnpm lint
pnpm build
```

## Environment

Copy `.env.example` to `.env.local` only when a real integration needs a key. Phase 1 does not require any values.

## Security Boundary

Private keys must never be sent to route handlers, logs, tests, or database writes. The backend can work with public wallet addresses, plan IDs, token addresses, preview math, and transaction signatures returned by the future Smithii browser library.
