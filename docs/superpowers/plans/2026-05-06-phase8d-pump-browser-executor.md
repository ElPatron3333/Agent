# Phase 8D Pump Browser Executor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the browser-only Smithii Pump executor foundation for Bundle Launch and supported Bundle Swap without adding a live UI button or backend live execution.

**Architecture:** Add `src/lib/smithii/pump-browser-executor.ts` as a structural-client adapter layered on top of the existing `BrowserExecutionPlan`. The module validates plan flow/expiry, sequences Smithii Pump SDK calls, and returns only normalized non-secret results or errors. Tests use fake clients and run without network or mainnet access.

**Tech Stack:** TypeScript, Vitest, `@smithii/sdk/pump` types, `@solana/web3.js` types, existing Smithii browser handoff module.

---

## File Structure

- Create `src/lib/smithii/pump-browser-executor.ts`: browser-only Pump executor types, validation, SDK call sequencing, and safe error normalization.
- Create `tests/unit/smithii-pump-browser-executor.test.ts`: focused TDD coverage for error normalization, plan validation, launch execution, and swap execution.
- Do not modify `src/app/api/chat/route.ts` or `src/components/smithii-agent-app.tsx` in this package.

## Task 1: Executor Error and Plan Validation Foundation

**Files:**
- Create: `tests/unit/smithii-pump-browser-executor.test.ts`
- Create: `src/lib/smithii/pump-browser-executor.ts`

- [ ] **Step 1: Write failing tests for safe error normalization and plan validation**

Add tests that import `normalizePumpBrowserExecutionError`, `assertBrowserExecutionPlan`, and `PumpBrowserExecutionError` from `../../src/lib/smithii/pump-browser-executor`.

Test cases:

```typescript
it("normalizes SDK-like errors without copying unsafe bodies", () => {
  const error = Object.assign(new Error("bundle exploded"), {
    name: "BundleError",
    bundleId: "bundle-123",
    body: { privateKey: "SHOULD_NOT_ECHO" },
  });

  const normalized = normalizePumpBrowserExecutionError(error);

  expect(normalized).toEqual({
    category: "bundle_failed",
    message: "bundle exploded",
    bundleId: "bundle-123",
  });
  expect(JSON.stringify(normalized)).not.toContain("SHOULD_NOT_ECHO");
  expect(JSON.stringify(normalized)).not.toContain("privateKey");
});

it("rejects wrong-flow and expired browser execution plans before SDK calls", () => {
  const launchPlan = browserPlan("bundle_launch", "2026-05-06T08:05:00.000Z");
  expect(() =>
    assertBrowserExecutionPlan(launchPlan, "bundle_swap", new Date("2026-05-06T08:00:00.000Z")),
  ).toThrow(PumpBrowserExecutionError);

  const expiredPlan = browserPlan("bundle_swap", "2026-05-06T08:05:00.000Z");
  expect(() =>
    assertBrowserExecutionPlan(expiredPlan, "bundle_swap", new Date("2026-05-06T08:05:00.001Z")),
  ).toThrow(PumpBrowserExecutionError);
});
```

Include a local helper:

```typescript
function browserPlan(flow: "bundle_launch" | "bundle_swap", expiresAt: string) {
  return {
    planId: `live_${flow}_test`,
    flow,
    wallet: "Wallet111",
    paramsHash: "params-hash",
    expectedFeesLamports: "100000000",
    expiresAt,
    nonce: "nonce",
    idempotencyKey: "idempotency-key",
  };
}
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm vitest run tests/unit/smithii-pump-browser-executor.test.ts`

Expected: FAIL because `src/lib/smithii/pump-browser-executor.ts` does not exist.

- [ ] **Step 3: Implement minimal foundation**

Create `src/lib/smithii/pump-browser-executor.ts` with:

- `PumpBrowserExecutionErrorCategory` union.
- `PumpBrowserExecutionError` class with `category`, optional `bundleId`, optional `signature`.
- `normalizePumpBrowserExecutionError(error: unknown)`.
- `assertBrowserExecutionPlan(plan, expectedFlow, now)`.

The normalization maps by `error.name`:

- `ValidationError` -> `validation`
- `ConfigError` -> `config`
- `BundleError` -> `bundle_failed`
- `TransactionFailedError` -> `transaction_failed`
- `TransactionTimeoutError` -> `timeout`
- `HttpError` and `RpcError` -> `network`
- default -> `unknown`

Only copy safe string fields: `message`, `bundleId`, `signature`.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `pnpm vitest run tests/unit/smithii-pump-browser-executor.test.ts`

Expected: PASS for Task 1 tests.

## Task 2: Bundle Launch Browser Executor

**Files:**
- Modify: `tests/unit/smithii-pump-browser-executor.test.ts`
- Modify: `src/lib/smithii/pump-browser-executor.ts`

- [ ] **Step 1: Write failing launch executor tests**

Add a test for `executePumpBundleLaunchBrowserHandoff` proving:

- `uploadMetadata` is called before `createAndSnipeToken`.
- `createAndSnipeToken` receives the uploaded metadata object.
- Result includes only flow, plan ID, idempotency key, mint public key, create tx signature, buyer tx signatures, bundle IDs, and payment signature.
- Result does not include buyer private keys or raw metadata fields.

Use a fake client with arrays recording calls, a fake mint keypair object exposing `publicKey.toBase58()`, and buyers with secret-looking `pk` values.

- [ ] **Step 2: Run test and verify RED**

Run: `pnpm vitest run tests/unit/smithii-pump-browser-executor.test.ts`

Expected: FAIL because `executePumpBundleLaunchBrowserHandoff` is not exported.

- [ ] **Step 3: Implement minimal launch executor**

Add types:

- `PumpBrowserExecutorClient` structural interface with `uploadMetadata`, `createAndSnipeToken`, and `bundleSellBuy` methods.
- `PumpBundleLaunchBrowserHandoffInput`.
- `PumpBundleLaunchBrowserHandoffResult`.

Implementation:

- Calls `assertBrowserExecutionPlan(plan, "bundle_launch", now)`.
- Calls `client.uploadMetadata(metadata)`.
- Calls `client.createAndSnipeToken` with `mintKeypair`, uploaded metadata, `devAmount`, `buyers`, `isCashbackCoin`, and `isTokenPregenerated`.
- Returns safe normalized result.
- On error, throws `normalizePumpBrowserExecutionError(error)`.

- [ ] **Step 4: Run test and verify GREEN**

Run: `pnpm vitest run tests/unit/smithii-pump-browser-executor.test.ts`

Expected: PASS for Task 1 and Task 2 tests.

## Task 3: Bundle Swap Browser Executor

**Files:**
- Modify: `tests/unit/smithii-pump-browser-executor.test.ts`
- Modify: `src/lib/smithii/pump-browser-executor.ts`

- [ ] **Step 1: Write failing swap executor tests**

Add tests for `executePumpBundleSwapBrowserHandoff` proving:

- `sol_to_token` maps to SDK `action: "buy"`.
- `token_to_sol` maps to SDK `action: "sell"`.
- `token_to_token` throws a `PumpBrowserExecutionError` with category `validation` before SDK calls.
- Empty or mismatched `privKeys` and `amounts` throw before SDK calls.
- Result does not include private keys.

Use `new PublicKey("11111111111111111111111111111111")` for mint.

- [ ] **Step 2: Run test and verify RED**

Run: `pnpm vitest run tests/unit/smithii-pump-browser-executor.test.ts`

Expected: FAIL because `executePumpBundleSwapBrowserHandoff` is not exported.

- [ ] **Step 3: Implement minimal swap executor**

Add types:

- `PumpBundleSwapDirection = "sol_to_token" | "token_to_sol" | "token_to_token"`.
- `PumpBundleSwapBrowserHandoffInput`.
- `PumpBundleSwapBrowserHandoffResult`.

Implementation:

- Calls `assertBrowserExecutionPlan(plan, "bundle_swap", now)`.
- Validates direction and arrays before SDK calls.
- Maps `sol_to_token` to `buy`, `token_to_sol` to `sell`.
- Calls `client.bundleSellBuy` with `mint`, `action`, `pool`, `privKeys`, and `amounts`.
- Returns safe normalized result.
- On SDK error, throws `normalizePumpBrowserExecutionError(error)`.

- [ ] **Step 4: Run test and verify GREEN**

Run: `pnpm vitest run tests/unit/smithii-pump-browser-executor.test.ts`

Expected: PASS for all executor tests.

## Task 4: Integration Safety Checks and Commit

**Files:**
- Verify: `src/app/api/chat/route.ts`
- Verify: `src/components/smithii-agent-app.tsx`
- Verify: `src/lib/smithii/pump-browser-executor.ts`

- [ ] **Step 1: Verify backend routes do not import the browser executor**

Run: `rg -n "pump-browser-executor" src/app src/pages`

Expected: no matches under backend route folders.

- [ ] **Step 2: Run targeted tests**

Run: `pnpm vitest run tests/unit/smithii-pump-browser-executor.test.ts tests/unit/smithii-browser-handoff.test.ts tests/unit/chat-route.test.ts`

Expected: PASS.

- [ ] **Step 3: Run full verification**

Run:

```bash
pnpm test
pnpm lint
pnpm build
git diff --check
```
