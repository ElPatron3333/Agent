# Phase 8H Browser Live Submit Design

Date: 2026-05-06
Branch: `feature/phase8h-browser-live-submit`
Status: implementation design after Phase 8G merge

## Goal

Add the guarded browser-side live submit layer for the prepared Pump Bundle Launch and Bundle Swap packets, without allowing backend Smithii execution or backend private-key handling.

## Scope

Phase 8H covers:

- Browser wallet signer discovery and connection for injected Phantom/Solflare-style providers.
- Runtime config validation for `NEXT_PUBLIC_SOLANA_RPC_URL`, `NEXT_PUBLIC_SMITHII_PROXY_URL`, and `NEXT_PUBLIC_SMITHII_JITO_UUID`.
- A pure browser live-submit helper that creates a `PumpFunClient` only in browser-facing code and calls the existing Phase 8D executor functions.
- Explicit user approval before any live submit attempt.
- App UI wiring that shows live-submit readiness, blocked reasons, pending status, sanitized success result, and sanitized failure result.
- Tests proving no private keys, metadata body text, image bytes, or mint secret material enter rendered submit status or executor results.

Phase 8H does not cover:

- Backend execution routes.
- Server-issued durable plan records.
- Production auth, billing, or rate limiting.
- Volume Bot live execution.
- Token-to-token Bundle Swap.
- Mainnet test execution. Live test runs still require runtime config, burner wallets, and explicit spend approval outside automated tests.

## Key Constraint

The Smithii SDK needs a connected browser signer for the dev/fee wallet plus browser-held secondary private keys for bundle buyers/swappers. The repo has no wallet-adapter dependency today. To avoid adding a broad dependency stack inside this phase, Phase 8H will use a small injected-provider adapter for wallet providers exposed on `window.solana` or `window.solflare`.

The adapter will produce the signer shape Smithii expects:

- `publicKey`
- `signTransaction(tx)`
- `signAllTransactions(txs)`

If no injected provider exists, if connection fails, or if the provider lacks signing methods, live submit remains blocked with a non-secret reason.

## Architecture

Add two focused modules:

1. `src/lib/solana/browser-wallet-signer.ts`
   - Detects Phantom/Solflare-style injected providers.
   - Connects to the provider.
   - Normalizes `publicKey` to an object with `toBase58()`.
   - Returns a signer object compatible with `createPumpBrowserClient(...)`.

2. `src/lib/smithii/browser-live-submit.ts`
   - Validates packet, signer, runtime config, and explicit approval.
   - Creates a Pump browser client through `createPumpBrowserClient(...)` unless a test injects a mock client.
   - Dispatches to `executePumpBundleLaunchBrowserHandoff(...)` or `executePumpBundleSwapBrowserHandoff(...)` based on packet kind.
   - Returns only sanitized status/result/error objects.

`SmithiiAgentApp` will keep the full secret-bearing executor packet out of rendered output. It will still not persist the full packet. On submit, it will re-run the existing packet preparation helper from current scoped browser state, then immediately pass the packet into the live-submit helper. The stored UI state remains sanitized.

## UI Behavior

The existing browser handoff panel gains a live-submit section when a browser preparation model exists.

Required UI gates:

- A browser wallet signer must be connected.
- The relevant browser packet must already be prepared and visible for the current scope.
- Runtime public Smithii config must validate.
- The user must tick an explicit approval checkbox for the current packet scope.
- The flow must be `bundle_launch` or supported `bundle_swap`; token-to-token remains blocked upstream.

Submit button labels:

- `Submit live launch via Smithii` for Bundle Launch.
- `Submit live swap via Smithii` for Bundle Swap.

Blocked submit states display only plain-language reasons. Successful submit status displays only public execution result fields:

Bundle Launch:

- flow
- plan ID
- idempotency key
- mint public key
- create transaction signature
- buyer transaction count
- bundle count
- payment signature

Bundle Swap:

- flow
- plan ID
- idempotency key
- action
- transaction count
- bundle count
- payment signature

No private key values, buyer `pk` labels, image bytes, metadata description text, mint keypair secret material, raw SDK bodies, or request payloads are rendered or logged by Phase 8H code.

## Error Handling

The live-submit helper normalizes executor and SDK errors with the existing `normalizePumpBrowserExecutionError(...)` behavior. UI error state includes:

- `category`
- `message`
- optional `bundleId`
- optional `signature`

It must not include raw SDK bodies or secret-bearing input objects.

## Testing

Use TDD.

Focused tests:

- Browser wallet signer connects an injected provider and produces signer methods.
- Browser wallet signer blocks missing provider, missing public key, missing sign methods, and failed connection.
- Browser live-submit helper blocks missing packet, missing signer, missing approval, and invalid runtime config.
- Browser live-submit helper routes Bundle Launch to upload metadata + create/snipe through the existing executor with an injected mock client.
- Browser live-submit helper routes Bundle Swap to bundle sell/buy through the existing executor with an injected mock client.
- Submit helper and app static guards prove secrets and private-key-shaped field names are not rendered.
- App static guard confirms `src/app` and `src/components` still do not import `pump-browser-executor.ts` directly.

Full phase verification:

- `pnpm vitest run tests/unit/solana-browser-wallet-signer.test.ts tests/unit/smithii-browser-live-submit.test.ts tests/unit/smithii-bundle-launch-browser-wiring.test.ts tests/unit/smithii-bundle-swap-browser-wiring.test.ts tests/unit/smithii-pump-browser-executor.test.ts tests/unit/smithii-agent-app-browser-preparation.test.ts`
- `pnpm exec tsc --noEmit`
- `pnpm test`
- `pnpm lint`
- `pnpm build`
- `git diff --check`
- `rg -n "pump-browser-executor" src/app src/components`

## Residual Watch Items

- Server-issued durable plan records remain a future production-hardening requirement before public live execution.
- No automated test can perform a real Smithii transaction; low-amount mainnet testing must be manual and explicitly approved.
- The injected-provider adapter is intentionally small. A full wallet-adapter UX can be added later if the app needs multi-wallet selection, auto-connect, and richer wallet UI.
