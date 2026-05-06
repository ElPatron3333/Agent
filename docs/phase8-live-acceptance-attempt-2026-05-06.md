# Phase 8 Live Acceptance Attempt

Date: 2026-05-06
Branch: `main`
Commit baseline: `1cf6ebeed08ebad5fc89462a0d41cd5247f1684c`
Status: blocked before live execution; superseded by later Smithii runtime response for the next attempt

## Scope

This attempt covered the approved Phase 8 live-acceptance sequence:

- prepare the low-amount mainnet runbook
- prepare runtime-input scaffolding
- run preflight for the first live acceptance pass
- decide whether Phase 8 is complete

No live Smithii transaction was submitted in this attempt.

## Artifacts Added

- `docs/phase8-live-acceptance-runbook.md`
- `docs/examples/phase8-burner-wallets.sample.csv`
- `scripts/phase8-live-preflight.mjs`
- `package.json` script: `phase8:live-preflight`

## Local Runtime Scaffold

A local ignored `.env.local` scaffold is now present to reduce manual setup drift.

Configured locally:

- `NEXT_PUBLIC_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com`
- `NEXT_PUBLIC_SMITHII_PROXY_URL=https://tools.smithii.io`
- generated local `SMITHII_PLAN_SIGNING_SECRET`

Still intentionally unset locally:

- `NEXT_PUBLIC_SMITHII_JITO_UUID`

Follow-up note: Smithii later confirmed that the next acceptance attempt should use `NEXT_PUBLIC_SMITHII_PROXY_URL=https://proxy-production-708c.up.railway.app` and a provided acceptance Jito UUID stored only in local ignored env. This original attempt remains a historical blocked dry run.

## Preflight Command

```text
pnpm phase8:live-preflight -- --wallet-csv D:\smithii-agent\docs\examples\phase8-burner-wallets.sample.csv --swap-mint So11111111111111111111111111111111111111112 --launch-image D:\smithii-agent\missing-launch-image.png
```

The `So11111111111111111111111111111111111111112` value was part of a blocked dry-run shape check. It is not an approved Pump target mint for live acceptance.

## Preflight Result

```text
Phase 8 live preflight
Repo: D:\smithii-agent
Runbook: docs/phase8-live-acceptance-runbook.md
Status: BLOCKED
- Missing env: NEXT_PUBLIC_SMITHII_JITO_UUID
- Wallet CSV with private keys must be outside the repo or inside a git-ignored local path: D:\smithii-agent\docs\examples\phase8-burner-wallets.sample.csv
- Wallet CSV still contains placeholder values: D:\smithii-agent\docs\examples\phase8-burner-wallets.sample.csv
- Launch image not found: D:\smithii-agent\missing-launch-image.png
```

## Additional Manual Gaps

These were not satisfiable from repo state alone and still prevent real live acceptance:

- no real burner buyer-wallet CSV was provided; the sample CSV is a template only and now fails preflight by design
- no approved low-risk Pump swap target mint was provided for the actual test run
- no launch image file was provided for the launch flow
- no browser wallet interaction was available in this CLI session

## Decision

Phase 8 is **not complete**.

The browser-only live-eligible flows remain implementation-ready but unaccepted in production conditions until a real operator provides the remaining runtime config and burner materials, then completes the manual browser-signed live runbook.

## Exit Criteria To Close Phase 8

Phase 8 can be closed after all of the following are completed on `main`:

- set `NEXT_PUBLIC_SMITHII_JITO_UUID` in the local non-checked-in env file
- update `NEXT_PUBLIC_SMITHII_PROXY_URL` in the local non-checked-in env file to Smithii's confirmed proxy URL
- provide a real burner buyer-wallet CSV outside the repo or in a git-ignored local path
- provide a real launch image file
- provide an explicitly approved low-risk Pump swap target mint
- execute Bundle Swap live acceptance successfully
- execute Bundle Launch live acceptance successfully, including metadata upload before transaction submission
- confirm no secret-bearing data appears in UI or backend responses
