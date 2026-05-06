# Phase 8G Main Post-Merge Readiness

Date: 2026-05-06T03:54:00+03:00
Branch: `main`
Merged branch: `feature/phase8g-bundle-launch-browser-wiring`
Merge commit: `0158971 Merge Phase 8G bundle launch browser wiring`
Merged through commit: `69a3976 Add Phase 8G SMAC report`

## Scope

Merged Phase 8G Bundle Launch browser wiring into `main` after Phase 8G implementation, verification, SMAC, and the audit-discovered scope fix were complete.

Included Phase 8G commits:

- `a873b5c Add Phase 8G bundle launch browser wiring design`
- `3136cc4 Add Phase 8G bundle launch browser wiring plan`
- `2add04e Add structured bundle launch preview metadata`
- `5a95d3e Add Phase 8G bundle launch browser wiring helper`
- `b1e897d Expose Phase 8G bundle launch preparation model`
- `bcad932 Render Phase 8G browser launch packet preparation`
- `e8b6eb1 Fix Phase 8G launch preparation scope`
- `69a3976 Add Phase 8G SMAC report`

## Verification

Run from `D:\smithii-agent` on `main` after the merge:

```text
pnpm vitest run tests/unit/smithii-bundle-launch-browser-wiring.test.ts tests/unit/smithii-bundle-swap-browser-wiring.test.ts tests/unit/smithii-pump-browser-executor.test.ts tests/unit/smithii-browser-handoff-ui.test.ts tests/unit/smithii-agent-app-browser-preparation.test.ts -> 5 files, 43 tests passed
pnpm exec tsc --noEmit -> passed
pnpm test -> 19 files, 205 tests passed
pnpm lint -> passed
pnpm build -> passed
pnpm diff --check equivalent: git diff --check -> passed
rg -n "pump-browser-executor" src/app src/components -> no matches
```

`pnpm build` still prints the known non-fatal dependency warnings for `punycode` and `bigint` native bindings. The production build completed successfully.

## Result

Phase 8G is merged into `main` locally and passes the normal post-merge readiness checks.

The Phase 8G SMAC found one confirmed issue during audit: launch preparation scope could reuse stale browser-local metadata image, mint keypair, or sanitized summary across different same-ID launch previews. It was fixed before merge in `e8b6eb1` and verified.

## Live-Readiness State

- Bundle Launch now has browser-only local packet preparation for Smithii Pump create-and-snipe inputs.
- Bundle Swap browser-only packet preparation from Phase 8F remains intact.
- `src/app` and `src/components` still do not import `pump-browser-executor.ts`.
- Real Smithii metadata upload and transaction submission remain intentionally out of scope until the final live submit phase.

## Residual Risk

- No open confirmed cleanup backlog remains from Phase 8G SMAC.
- No DOM interaction test exists for the file input and prepare button because the repo still has no frontend test harness.
- No low-amount mainnet run was performed. Actual live testing still requires runtime config, burner wallets, and explicit spend approval.
