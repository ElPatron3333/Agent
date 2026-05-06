# Smithii Live Acceptance Runtime Request

We have already integrated the public `@smithii/sdk/pump` path for the browser-only Pump flows and are ready to run the first low-amount mainnet acceptance pass.

This is not a repeat of the full integration questionnaire. We only need the runtime value(s) and confirmations below to start the live acceptance run.

## Required From Smithii

### 1. Jito UUID for browser SDK execution

Please send the Jito UUID we should use for the Pump browser SDK flows:

```env
NEXT_PUBLIC_SMITHII_JITO_UUID=<value-from-smithii>
```

We use it in the browser-side SDK client like this:

```ts
const client = new PumpFunClient({
  connection: new Connection(RPC_URL, "confirmed"),
  signer: walletAdapterSigner,
  jito: {
    uuid: JITO_UUID,
    proxyUrl: SMITHII_PROXY_URL,
  },
  proxyUrl: SMITHII_PROXY_URL,
});
```

Please confirm:

- Is this UUID safe/intended to be exposed to the browser as a `NEXT_PUBLIC_*` runtime value?
- Is the UUID partner-specific, domain-bound, rate-limited, or shared with Smithii Tools?
- If the UUID should not be browser-exposed, what is the supported browser-side auth pattern for `@smithii/sdk/pump`?

### 2. Confirm the Smithii proxy URL

We currently plan to use:

```env
NEXT_PUBLIC_SMITHII_PROXY_URL=https://tools.smithii.io
```

Please confirm this is the correct proxy/base URL for:

- `PumpFunClient.uploadMetadata(...)`
- `PumpFunClient.bundleSellBuy(...)`
- `PumpFunClient.createAndSnipeToken(...)`

Please also confirm whether the URL needs any path suffix or if `https://tools.smithii.io` is enough.

## Helpful But Optional

### 3. Recommended low-amount live test target

For the first Bundle Swap live acceptance test, do you have a recommended low-risk Pump token mint we should use?

If not, we will use a Pump token we control or explicitly approve locally.

### 4. Minimum practical test amounts

Please confirm whether these first-run amounts are reasonable:

- Bundle Swap buy: `0.01` to `0.02` SOL with one burner bundle wallet
- Bundle Launch buyer amount: `0.005` to `0.01` SOL with one burner buyer wallet

If there are lower bounds where Jito/Smithii/Pump execution becomes unreliable, please tell us the minimum practical values.

## What We Do Not Need From Smithii

Do not send private keys, seed phrases, burner wallet CSVs, or launch image files.

We will provide locally:

- the burner connected wallet
- the burner buyer-wallet CSV
- the launch image
- the approved low-risk swap mint if Smithii does not provide one
- browser wallet approval for the live run

## Current Blocker

Our current preflight is blocked on:

```text
Missing env: NEXT_PUBLIC_SMITHII_JITO_UUID
```

Once we have that value, we can run the local preflight again and proceed with the low-amount mainnet acceptance run.
