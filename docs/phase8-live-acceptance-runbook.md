# Phase 8 Low-Amount Mainnet Acceptance Runbook

Date: 2026-05-06
Status: ready for manual execution once runtime config and burner materials exist
Owner: local operator with browser wallet approval

## Goal

Execute the first live acceptance tests for the browser-only live-eligible Smithii flows on mainnet:

- Bundle Swap: SOL-to-token or token-to-SOL
- Bundle Launch: Pump create-and-snipe

This runbook does not cover:

- Volume Bot
- Launch + Volume
- token-to-token Bundle Swap
- backend execution

Those flows remain blocked by the current Smithii contract.

## Preconditions

- Branch: `main`
- Repo root: `D:\smithii-agent`
- Current merged state includes Phase 8H browser live submit.
- Use burner wallets only.
- Use explicit low amounts.
- Stop immediately on any secret leak, wrong-wallet prompt, or unexpected execution path.

## Required Runtime Config

Set these before starting the app:

- `NEXT_PUBLIC_SOLANA_RPC_URL`
- `NEXT_PUBLIC_SMITHII_PROXY_URL`
- `NEXT_PUBLIC_SMITHII_JITO_UUID`
- `SMITHII_PLAN_SIGNING_SECRET`

`.env.example` already contains the required keys. Create a local env file outside git tracking before the test run.

## Required Manual Materials

- A burner connected wallet in Phantom or Solflare for the dev/fee wallet.
- A burner buyer wallet CSV with a single `privateKey` header and at least one real burner private-key row for the secondary bundle wallet import.
- A live Pump token mint for the swap test that you control or explicitly approve for low-amount testing.
- A launch image file in `.png`, `.jpg`, or `.jpeg` format for the launch test.
- Burner wallet balances sufficient for fees plus tiny test sizes.

## Preflight Command

Run this from `D:\smithii-agent` before starting the app:

```text
pnpm phase8:live-preflight -- --wallet-csv <abs-path-to-burner-wallets.csv> --swap-mint <pump-token-mint> --launch-image <abs-path-to-launch-image.png>
```

The preflight checks:

- required env vars are set
- wallet CSV exists and starts with `privateKey`
- swap mint argument is present
- launch image exists with a supported extension

The preflight does not inspect wallet balances or browser extensions. Those remain manual checks.

## Execution Order

### 1. Bundle Swap live acceptance

Use the lowest useful happy-path surface first.

Suggested parameters:

- direction: `sol_to_token` first
- participating wallets: 1 burner bundle wallet
- quantity mode: fixed or total with `0.01` to `0.02` SOL
- tx count: `1`
- tx delay blocks: `0`
- keep unsupported live overrides out of scope

Steps:

1. Run the preflight command.
2. Start the app with `pnpm dev`.
3. Open the app in a browser with Phantom or Solflare installed.
4. Connect the burner dev/fee wallet.
5. Import the burner buyer CSV through the wallet roster UI.
6. Build a Bundle Swap preview for the target mint.
7. Prepare the browser packet.
8. Tick explicit live submit approval.
9. Submit live swap via Smithii and approve the wallet signature.
10. Record the returned plan ID, idempotency key, action, tx count, bundle count, and payment signature.
11. Verify the on-chain tx signature in explorer.

Pass criteria:

- UI stays on the browser-only live path.
- Returned result contains non-secret fields only.
- At least one transaction signature is returned and confirms on chain.
- No private-key-shaped label or secret value is rendered in success or failure UI.

### 2. Bundle Launch live acceptance

Run only after the swap test path succeeds.

Current implementation note:

- The launch preparation helper currently requires at least one bundle buyer wallet. Use one buyer for the first live test even though Smithii said one or zero buyers can be valid at the SDK level.

Suggested parameters:

- one burner dev wallet connected in Phantom/Solflare
- one burner buyer wallet imported from CSV
- one low buy amount such as `0.005` to `0.01` SOL
- no pregenerated token address
- cashback off
- socials off unless specifically needed for the test

Steps:

1. Re-run the preflight command.
2. Keep the burner dev wallet connected.
3. Build a Bundle Launch preview with a minimal test token name/symbol and the launch image.
4. Prepare the browser packet.
5. Tick explicit live submit approval.
6. Submit live launch via Smithii and approve the wallet signature.
7. Record the returned mint, create tx signature, buyer tx count, bundle count, and payment signature.
8. Verify the create tx signature and mint on chain.

Pass criteria:

- UI stays on the browser-only live path.
- Returned result contains non-secret fields only.
- Create tx signature confirms on chain.
- Mint matches the UI result.
- No private-key-shaped label or secret value is rendered in success or failure UI.

## Failure Handling

Stop the run and record the exact failure if any of these happen:

- wrong connected wallet is accepted for the prepared plan
- backend receives or reflects private-key-shaped data
- unsupported flow becomes live-submittable
- tx submission fails with a secret-bearing message in UI
- wallet prompt or explorer result contradicts the returned plan/result fields

## Result Recording

Capture these artifacts for each attempt:

- date/time
- git commit on `main`
- test flow
- target mint or new mint
- connected wallet pubkey
- returned plan ID and idempotency key
- returned tx signatures and bundle IDs
- explorer confirmation result
- pass or fail
- blocker if the run did not execute

## Phase 8 Decision Rule

Phase 8 can be treated as complete for the live-eligible flows only if:

- preflight passes with real runtime config and burner materials
- Bundle Swap live acceptance passes
- Bundle Launch live acceptance passes
- unsupported flows remain blocked
- no secret-bearing UI or backend regression is observed

Until then, Phase 8 remains incomplete and closed beta should not start.
