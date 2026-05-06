# Phase 8F Bundle Swap Browser Wiring Design

Date: 2026-05-06
Branch: `feature/phase8f-bundle-swap-browser-wiring`
Status: approved direction from Phase 8E follow-up

## Goal

Wire the first browser-owned Smithii execution path for Bundle Swap without enabling backend execution or adding any server-side private-key handling. This phase prepares and validates the browser execution packet that can feed the existing Phase 8D Pump browser executor.

## Scope

This phase covers Bundle Swap only:

- SOL-to-token and token-to-SOL swaps.
- Browser-local wallet roster material as the source for participating wallet private keys.
- A non-secret browser execution plan built from public preview parameters.
- Local readiness and packet-preparation UI inside the existing browser handoff panel.
- Tests proving private keys never enter backend routes, plans, UI display models, audit payloads, or execution results.

This phase does not build:

- Bundle Launch execution wiring.
- Token-to-token Bundle Swap execution.
- Wallet adapter signing or a connected wallet modal.
- A live Smithii execute button that submits real transactions.
- Backend Smithii execution or any API route that accepts private keys.

## Approach

The implementation adds a browser-only Bundle Swap wiring helper under `src/lib/smithii/`. The helper accepts the current Bundle Swap preview, pending plan, Smithii live boundary, wallet roster, fee wallet public key, nonce, and clock. It returns either a blocked readiness reason or a prepared browser packet.

The prepared packet contains two layers:

1. A non-secret `BrowserExecutionPlan` created with `createBrowserExecutionPlan(...)`. Its params include only public preview data such as direction, token mint, routing, ready wallet pubkeys, amounts, and plan ID.
2. A browser-local executor input that includes the participating wallet private keys and amounts for `executePumpBundleSwapBrowserHandoff(...)`. This object must never be serialized into UI, server requests, audit logs, or docs.

The React app imports only the pure wiring helper, not `pump-browser-executor.ts`. When the handoff panel is for Bundle Swap, it can prepare the local packet and show a sanitized summary. The action remains a preparation step; it does not call Smithii or submit transactions.

## Data Flow

1. `/api/chat` prepares a Bundle Swap preview and signed pending plan as it does today.
2. `SmithiiAgentApp` keeps the preview, pending plan, Smithii boundary, and wallet roster in browser state.
3. The Phase 8F helper validates:
   - preview kind is `bundle_swap`,
   - pending plan tool is `bundle_swap`,
   - preview plan ID matches pending plan ID,
   - Smithii live mode is `browser-handoff-ready`,
   - direction is not `token_to_token`,
   - a valid token mint can be identified,
   - routing maps to the supported Pump pool,
   - every ready preview wallet has a browser roster entry with private-key material,
   - there is at least one ready wallet and matching amount.
4. If blocked, the UI shows the reason and keeps preparation disabled.
5. If ready, the UI can prepare the packet locally and show only a sanitized summary: flow, action, pool, wallet count, amount count, plan ID, idempotency key, expected fee, and status.

## Security Boundaries

- No API route is modified.
- No backend code imports `pump-browser-executor.ts`.
- `src/components` must not import `pump-browser-executor.ts` directly.
- Prepared execution input may contain private keys only in browser-local memory.
- The non-secret plan params and UI summaries must not contain private-key-shaped fields or values.
- The UI must not log the prepared executor input.
- Execution remains a local preparation action until a future phase adds wallet adapter signing and an explicit live submit gate.

## Error Handling

The helper returns typed blocked states instead of throwing for normal readiness failures. Examples: missing preview, unsupported direction, invalid mint, unsupported routing, no ready wallets, missing roster key, or mismatched plan.

Actual executor errors remain owned by `pump-browser-executor.ts` and are already normalized by Phase 8D. Phase 8F may add a small dependency-injected bridge test, but the UI does not call live execution in this phase.

## Testing

Use TDD with focused unit tests:

- Bundle Swap SOL-to-token creates a non-secret plan and browser-local executor input.
- Token-to-SOL maps to SDK sell action via the existing executor path.
- Token-to-token, missing plan, mismatched plan ID, blocked Smithii boundary, invalid mint, unsupported routing, no ready wallets, or missing roster key produce blocked readiness.
- Serialized public plan and UI summary do not contain private-key-shaped fields or demo private-key values.
- `src/app` and `src/components` do not import `pump-browser-executor.ts`.

Full phase verification:

- `pnpm vitest run tests/unit/smithii-bundle-swap-browser-wiring.test.ts tests/unit/smithii-pump-browser-executor.test.ts tests/unit/smithii-browser-handoff-ui.test.ts`
- `pnpm exec tsc --noEmit`
- `pnpm test`
- `pnpm lint`
- `pnpm build`
- `git diff --check`
- `rg -n "pump-browser-executor" src/app src/components`