# Phase 8A: Smithii Live Boundary

Date: 2026-05-05
Branch: feature/phase8a-live-boundary
Status: implemented as a typed boundary; live execution remains disabled.

## Purpose

Phase 8A starts the Smithii library wire-up without crossing the zero-custody line. The app can now classify each prepared preview as one of these states:

- `mock`: the current confirmed execution path; no live Smithii call is made.
- `browser-handoff-ready`: the preview has a known Smithii SDK target, but execution must happen in the browser with user-held signer material.
- `blocked-awaiting-smithii`: the preview cannot be live-wired until Smithii answers an integration question or exposes a missing capability.

The backend still cannot receive wallet key material, cannot run live Smithii execution, and cannot add server-side private-key schemas.

## Current Flow Status

| Flow | Phase 8A state | SDK target | Reason |
|---|---|---|---|
| Bundle Launch | Browser handoff ready | `PumpFunClient.createAndSnipeToken` | Maps to the SDK, but buyer signer material is browser-only. |
| Bundle Swap: SOL to token | Browser handoff ready | `PumpFunClient.bundleSellBuy` | Maps to SDK `buy`, but participating wallet signer material is browser-only. |
| Bundle Swap: token to SOL | Browser handoff ready | `PumpFunClient.bundleSellBuy` | Maps to SDK `sell`, but participating wallet signer material is browser-only. |
| Bundle Swap: token to token | Blocked awaiting Smithii | None confirmed | `bundleSellBuy` does not expose token-to-token swaps. |
| Volume Bot | Blocked awaiting Smithii | `AntiMEVClient.runSingle` partial | SDK fields for Pro Volume Bot sell behavior are unresolved. |
| Launch + Volume sequence | Blocked awaiting Smithii | Composite | Cannot be live until Volume Bot mapping and sequencing semantics are confirmed. |

## Backend Rule

`src/lib/smithii/live-boundary.ts` exposes `requireServerLiveExecutionBlocked()`, which always throws. This is intentional. It gives future code a hard boundary: live Smithii calls must not be added to the Next.js route handler while the architecture remains zero-custody.

The `/api/chat` response can include safe live-boundary metadata, but it must not include key values or private-key-shaped field names. Existing route tests assert that private-key strings do not appear in responses.

## What Changed

- Added a typed Smithii live-boundary module.
- Attached live-boundary metadata to preview responses and mock execution results.
- Surfaced Phase 8A status in the app UI as display-only state.
- Kept the existing mock execution path unchanged.
- Added unit tests for supported handoffs, blocked flows, server execution blocking, and response safety.

## Questions For Smithii

These are the questions that now block real Phase 8 execution:

1. Can Smithii provide the browser-side transaction assembly module, or equivalent zero-custody handoff, for Bundle Launch, Bundle Swap, and Volume Bot?
2. For Bundle Launch, what exact metadata upload and mint keypair flow should the browser use before calling `PumpFunClient.createAndSnipeToken`?
3. For Bundle Swap, does Smithii expose a zero-custody token-to-token bundle swap path for Pro users?
4. For Bundle Swap, should routing be selected by Smithii, by our Helius read, or by a Smithii-provided preflight call?
5. Does `AntiMEVClient.runSingle` exactly power Smithii Pro Volume Bot, or is it a separate Anti-MEV volume product?
6. Where do Volume Bot `onPurchase`, `sellTiming`, `sellMode`, and `sellStrategy` map in SDK v0.2.0?
7. Can Smithii provide a zero-custody multi-wallet Volume Bot flow, or is the multi-wallet flow intentionally backend-keyed?
8. What idempotency key should be sent for each execute handoff, and does Smithii dedupe duplicate execution attempts?
9. What status lifecycle is exposed for Volume Bot: polling only, webhook callbacks, or both?
10. Is there a sandbox/devnet endpoint? If not, what mainnet low-amount test procedure does Smithii recommend?
11. How are Smithii service fees enforced server-side, and what response fields confirm the fee was paid?
12. What wallet cap does Smithii enforce for Bundle Swap today: 20 or 25?

## Verification

Focused Phase 8A checks:

- `pnpm test tests/unit/smithii-live-boundary.test.ts tests/unit/mock-agent.test.ts tests/unit/smithii-sdk-adapter.test.ts tests/unit/chat-route.test.ts`

Before merge, also run:

- `pnpm test`
- `pnpm lint`
- `pnpm build`
- `git diff --check`

## Audit Reminder

Before Phase 8A is merged into `main` or before any real Smithii execution is enabled, run a focused SMAC audit on the Phase 8A branch. The audit should specifically check response redaction, route schemas, server-side live execution blockers, and every unresolved Smithii integration assumption.
