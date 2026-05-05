# Phase 8D Pump Browser Executor Design

Date: 2026-05-06
Branch: `feature/phase8d-pump-browser-executor`
Status: approved for implementation

## Goal

Add the browser-only Smithii Pump execution adapter foundation for the two unlocked Phase 8C flows without exposing a live UI button or adding backend live execution.

## Scope

This package builds a typed executor module for:

- Bundle Launch through `PumpFunClient.uploadMetadata(...)` followed by `PumpFunClient.createAndSnipeToken(...)`.
- Bundle Swap SOL-to-token and token-to-SOL through `PumpFunClient.bundleSellBuy(...)`.

This package does not build:

- A live execute button.
- Backend Smithii execution.
- Token-to-token swaps.
- Classic Volume Bot or Launch + Volume live execution.
- Low-amount mainnet test execution.

## Architecture

Create `src/lib/smithii/pump-browser-executor.ts` as a small browser-boundary adapter. It will accept an already-created Pump client, a non-secret `BrowserExecutionPlan`, and browser-held flow inputs. The adapter owns SDK call sequencing and result/error normalization only.

The module will use structural client types instead of directly constructing a client. Existing `src/lib/smithii/browser-handoff.ts` remains responsible for public runtime config, `PumpFunClient` construction, and non-secret plan creation.

The executor will be importable for tests and future client UI code, but backend routes must not import or call it.

## Data Flow

### Bundle Launch

1. Caller creates a non-secret `BrowserExecutionPlan` with `flow: "bundle_launch"`.
2. Browser UI gathers browser-held metadata image, mint keypair, and buyer private keys.
3. Executor validates the plan flow and expiry.
4. Executor calls `client.uploadMetadata(...)` with metadata fields and the image `File` or `Blob`.
5. Executor passes the returned metadata object to `client.createAndSnipeToken(...)` with `mintKeypair`, `devAmount`, buyers, and supported flags.
6. Executor returns only non-secret result fields: flow, plan ID, idempotency key, mint public key, create signature, buyer signatures, bundle IDs, and payment signature.

### Bundle Swap

1. Caller creates a non-secret `BrowserExecutionPlan` with `flow: "bundle_swap"`.
2. Browser UI gathers browser-held wallet private keys and per-wallet amounts.
3. Executor validates the plan flow, expiry, supported direction, non-empty parallel arrays, and no token-to-token direction.
4. Executor calls `client.bundleSellBuy(...)` with `mint: PublicKey`, `action: "buy" | "sell"`, `pool`, `privKeys`, and `amounts`.
5. Executor returns only non-secret result fields: flow, plan ID, idempotency key, action, bundle IDs, tx signatures, and payment signature.

## Security Boundaries

- The executor may receive private keys only because it is for browser-side use. It must never send them to our backend and must not include them in returned result objects or error objects.
- The executor must not log raw SDK inputs, raw errors, private keys, mnemonic phrases, seed phrases, or raw request bodies.
- Server live execution remains blocked through existing route behavior and `requireServerLiveExecutionBlocked(...)`.
- Result objects must be safe to render or audit: signatures, bundle IDs, mint public key, plan ID, idempotency key, flow, and normalized error categories only.

## Error Handling

Add a local normalized error contract that maps SDK/runtime failures into app-owned categories:

- `config`: missing or invalid local executor input.
- `validation`: invalid caller input or SDK validation failure.
- `bundle_failed`: Jito bundle failure.
- `transaction_failed`: on-chain transaction failure.
- `timeout`: transaction or confirmation timeout.
- `network`: HTTP or RPC failure.
- `unknown`: all other failures.

The normalized error must include only `category`, `message`, and optional safe identifiers such as `bundleId` or `signature`. It must not copy arbitrary SDK error bodies.

## Testing

Use TDD with `tests/unit/smithii-pump-browser-executor.test.ts`. Tests will use fake structural clients and real behavior assertions, not mainnet calls.

Required coverage:

- Normalizes known SDK-like errors into safe local error objects.
- Rejects expired plans and wrong-flow plans before any SDK call.
- Bundle Launch calls `uploadMetadata` before `createAndSnipeToken` and returns only non-secret fields.
- Bundle Launch result never contains buyer private keys or metadata body fields.
- Bundle Swap maps directions to lowercase SDK actions and rejects token-to-token.
- Bundle Swap validates non-empty parallel private-key and amount arrays before SDK calls.
- Bundle Swap result never contains private keys.

