# Smithii Live Testing Instructions

Status: ready for Smithii-controlled low-amount mainnet acceptance testing
Repo: `https://github.com/ElPatron3333/Agent`
Branch: `main`
Minimum code commit: `37acf53`
Full runbook: `docs/phase8-live-acceptance-runbook.md`

## Goal

Run the first controlled live acceptance pass for the browser-only Pump flows:

1. Bundle Swap: SOL-to-token or token-to-SOL.
2. Bundle Launch: Pump create-and-snipe with metadata upload.

This is not closed beta or production launch. It is a low-amount acceptance test to prove the browser handoff, Smithii SDK execution, result handling, and zero-custody boundaries.

## Do Not Test These Flows Yet

- Classic Volume Bot.
- Launch + Volume sequence.
- Token-to-token Bundle Swap.
- Any backend/server-side live Smithii execution path.
- Any future tool such as Maker/Taker, Bags, Bonk, LaunchLab, Moonit, Market Maker, Mantis, Token Manager, Multisender, Token Creator, Vesting, Claim, EVM, or SUI tools.

Those remain blocked until separately specified.

## Safety Rules

- Use burner wallets only.
- Use tiny amounts only.
- Keep all private keys, seed phrases, and burner wallet CSVs local to the test machine.
- Do not send private keys, seed phrases, or burner wallet CSVs back to us.
- Do not put real keys or live artifacts in tracked repo files.
- Stop immediately if the UI, logs, browser console, API response, or error message exposes a private-key-shaped value.
- Stop immediately if an unsupported flow becomes live-submittable.
- Stop immediately if the wallet prompt does not match the expected burner wallet or expected low-amount action.

## Runtime Config

Create a local `.env.local` file in the repo root. This file is gitignored.

Required values:

```env
NEXT_PUBLIC_SOLANA_RPC_URL=<mainnet-rpc-url>
NEXT_PUBLIC_SMITHII_PROXY_URL=https://proxy-production-708c.up.railway.app
NEXT_PUBLIC_SMITHII_JITO_UUID=<smithii-acceptance-jito-uuid>
SMITHII_PLAN_SIGNING_SECRET=<long-random-local-secret>
```

Notes:

- Use the Smithii acceptance Jito UUID that Smithii provided internally for this test.
- Do not commit the UUID to the repo.
- Do not use `https://tools.smithii.io` as the SDK proxy URL for this acceptance pass.
- Do not add a proxy path suffix; the SDK appends required routes internally.

## Local Test Materials

Create these on the Smithii test machine:

1. Burner connected wallet in Phantom or Solflare for the dev/fee wallet.
2. Burner buyer wallet CSV with a `privateKey` column and at least one real burner private key.
3. Launch image file: `.png`, `.jpg`, or `.jpeg`.
4. Approved low-risk Pump token mint for the Bundle Swap test.

Recommended local structure:

```text
.smithii-local/phase8-live/burner-wallets.csv
.smithii-local/phase8-live/launch-image.png
.smithii-local/phase8-live/run-notes.md
```

`.smithii-local/` is gitignored.

The wallet CSV should look like this:

```csv
privateKey
<real-burner-private-key>
```

For the swap mint, use a Smithii-controlled Pump token or a token explicitly approved locally for this test. Do not use an arbitrary third-party Pump token for the first acceptance pass.

## Setup Commands

From a clean test machine:

```powershell
git clone https://github.com/ElPatron3333/Agent.git smithii-agent
cd smithii-agent
git checkout main
git pull --ff-only origin main
git rev-parse --short HEAD
pnpm install
```

Confirm the commit is `37acf53` or newer on `main`.

## Preflight

Run this before starting the app:

```powershell
pnpm phase8:live-preflight -- --wallet-csv <abs-path-to-burner-wallets.csv> --swap-mint <approved-low-risk-pump-token-mint> --launch-image <abs-path-to-launch-image.png>
```

Expected successful result:

```text
Status: READY
```

Do not proceed to browser testing unless preflight returns `Status: READY`.

Preflight checks env presence, wallet CSV location/shape, swap mint shape, and launch image extension. It does not check wallet balances, token eligibility, browser extensions, or metadata upload success; verify those manually.

## Start The App

After preflight passes:

```powershell
pnpm dev
```

Open the local app URL in a browser with Phantom or Solflare installed and unlocked.

## Test 1: Bundle Swap

Run Bundle Swap before Bundle Launch.

Recommended parameters:

- Direction: `sol_to_token` first.
- Participating wallets: one burner buyer wallet from the CSV.
- Amount: `0.01` to `0.02` SOL.
- Tx count: `1`.
- Tx delay blocks: `0`.
- Unsupported overrides: leave out of scope.

Steps:

1. Connect the burner dev/fee wallet in Phantom or Solflare.
2. Import the burner buyer CSV through the wallet roster UI.
3. Build a Bundle Swap preview for the approved Pump mint.
4. Prepare the browser packet.
5. Check explicit live submit approval.
6. Submit live swap via Smithii.
7. Approve only if the wallet prompt matches the expected burner wallet and low amount.
8. Record the returned plan ID, idempotency key, action, tx count, bundle IDs, tx signatures, and payment signature.
9. Verify the returned tx signature on chain.

Pass criteria:

- UI stays on the browser-only live path.
- At least one transaction signature is returned and confirms on chain.
- Returned result contains only non-secret/public fields.
- No private-key-shaped label or secret value appears in UI, API responses, logs, or errors.

## Test 2: Bundle Launch

Run Bundle Launch only after Bundle Swap passes.

Recommended parameters:

- One burner dev wallet connected in Phantom/Solflare.
- One burner buyer wallet imported from the CSV.
- Buyer amount: `0.01` SOL.
- Pregenerated token address: off.
- Cashback: off.
- Socials: off unless explicitly needed.
- Launch image: local `.png`, `.jpg`, or `.jpeg` file.

Steps:

1. Re-run the preflight command.
2. Keep the burner dev wallet connected.
3. Build a Bundle Launch preview with minimal test token metadata.
4. Prepare the browser packet.
5. Check explicit live submit approval.
6. Submit live launch via Smithii.
7. Approve only if the wallet prompt matches the expected burner wallet and low amount.
8. Record whether metadata upload completed before transaction submission.
9. Record returned mint, create tx signature, buyer tx signatures, bundle IDs, and payment signature.
10. Verify the create tx signature and mint on chain.

Pass criteria:

- UI stays on the browser-only live path.
- Metadata upload completes before transaction submission.
- Create tx signature confirms on chain.
- Returned mint matches the UI result.
- Returned result contains only non-secret/public fields.
- No private-key-shaped label or secret value appears in UI, API responses, logs, or errors.

## Failure Handling

Stop the run and report the exact blocker if any of these happen:

- Preflight does not return `Status: READY`.
- Wrong connected wallet is accepted for the prepared plan.
- Backend receives or reflects private-key-shaped data.
- Unsupported flow becomes live-submittable.
- Metadata upload fails before transaction creation.
- Transaction submission fails with a secret-bearing message in UI/logs/errors.
- Wallet prompt or explorer result contradicts returned plan/result fields.
- Any transaction amount or destination is unexpected.

## Results To Send Back

Please return this information after testing:

```markdown
# Smithii Live Acceptance Result

Date/time:
Repo commit:
Tester:
Runtime proxy URL:
Swap target mint:
Connected burner wallet pubkey:
Buyer wallet pubkey(s):

## Bundle Swap

Preflight status:
Plan ID:
Idempotency key:
Action:
Bundle IDs:
Transaction signatures:
Payment signature:
Explorer verification:
Pass/fail:
Blocker or notes:

## Bundle Launch

Preflight status:
Metadata upload result:
Plan ID:
Idempotency key:
Mint:
Create transaction signature:
Buyer transaction signatures:
Bundle IDs:
Payment signature:
Explorer verification:
Pass/fail:
Blocker or notes:

## Safety Check

Did any private key, seed phrase, private-key-shaped field, or secret value appear in UI/API/logs/errors? yes/no
Did unsupported flows remain blocked? yes/no
Did wallet prompts match expected burner wallets and low amounts? yes/no
```

Do not include private keys, seed phrases, burner wallet CSVs, or the exact Jito UUID in the returned result.

## Completion Rule

Phase 8 is accepted only after both live-eligible flows pass:

- Bundle Swap live acceptance passes.
- Bundle Launch live acceptance passes, including metadata upload.
- Unsupported flows remain blocked.
- No private-key or secret-bearing regression is observed.

After Smithii sends the result, we will record the acceptance outcome, run one scoped SMAC for the live-acceptance phase, and fix confirmed findings before any beta claim.
