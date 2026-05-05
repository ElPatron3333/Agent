# Smithii Integration Questions

Goal: wire our Smithii Agent to execute Pump.fun flows through Smithii safely.

What we need from Smithii: exact supported APIs, auth/licensing rules, signer model, limits/fees, success/error contracts, and a safe test procedure.

Hard requirements on our side:

- Our backend cannot receive, proxy, store, or log private keys, seed phrases, or private-key-shaped fields.
- Users must see a preview first, then explicitly confirm execution.
- We will enable only the flows Smithii supports with a clear zero-custody path.

## 1. Browser Execution, Auth, and Results

1. What browser-side module/API should we use for zero-custody execution of Bundle Launch, Bundle Swap, and Volume Bot? Please include package name, import path, initialization code, provider/wallet-adapter requirements, and whether this is public `@smithii/sdk`, a partner build, or another browser transaction-assembly module.
2. Does any supported path require raw private keys to be sent to Smithii or to our backend? If yes, which flows cannot be zero-custody today?
3. How should partner auth/licensing work: domain lock, signed license, per-user key, OAuth, wallet signature, or another model?
4. Which fields should our backend issue before browser execution, if any? For example: signed preview/plan record, partner token, session token, quote ID, expiry, or replay protection.
5. What idempotency key should we send for each execution, and how does Smithii handle duplicate confirmations or retries?
6. What success fields should we expect for each flow: mint address, transaction signature, per-wallet result, bot/run ID, status URL, fee proof, or anything else?
7. What error codes/states can execution return: rejected signature, insufficient funds, expired quote, rate limit, route changed, fee failure, partial submission, or transaction submitted but later failed?

## 2. Bundle Launch

1. What exact metadata upload flow should we use before `PumpFunClient.createAndSnipeToken`?
2. Who generates and holds the mint keypair when `pregenerateTokenAddress` is enabled or disabled?
3. What signer model should bundle buyer wallets use: wallet adapter signers, raw keys kept only in browser memory/local storage, encrypted local key objects, or another abstraction?
4. What Bundle Launch limits and fees does Smithii enforce today: wallet cap, min/max buy amount, service fee, pregeneration fee, Jito/priority fee controls, slippage support, and metadata/image/social limits?
5. What exact success response should we expect after a live launch?
6. If a Bundle Launch fails before completion, what happens to user funds and Smithii service fees, especially the 0.10 SOL service fee? Is it charged, refunded, credited, manually recoverable, or never taken unless launch succeeds?

## 3. Bundle Swap

1. Does Smithii expose a zero-custody token-to-token bundle swap path for Pro users, or should token-to-token stay blocked?
2. Should live routing be selected by Smithii, by our Helius read, by the user, or by a Smithii preflight/quote call?
3. How do Smithii Pro quantity modes map to live Bundle Swap inputs: total SOL, fixed per transaction SOL, random SOL range, random percentage range, and token amount modes?
4. Which per-transaction overrides are supported: slippage, gas, priority fee, MEV shield, Jito tip, delay blocks, or anything else?
5. Is Bundle Swap atomic across all participating wallets, or can some wallet swaps succeed while others fail?
6. What wallet cap does Smithii enforce for Bundle Swap today: 20, 25, or another number?

## 4. Volume Bot

1. Does `AntiMEVClient.runSingle` power Smithii Pro Volume Bot, or is it a separate Anti-MEV volume product?
2. If Volume Bot is not fully exposed in SDK v0.2.0, which SDK version, endpoint, or browser module should we use or wait for?
3. Where do these Volume Bot fields map in the live Smithii contract: `onPurchase`, `sellTiming`, `sellMode`, and `sellStrategy`?
4. In `AntiMEVSingleConfig.randomize`, does `randomize` only randomize per-bundle buy/sell direction, or can it also randomize amounts, delays, wallet selection, or other behavior?
5. Can Smithii provide a zero-custody multi-wallet Volume Bot flow, or is multi-wallet volume intentionally backend-keyed?
6. Which wallet pays Volume Bot fees, when are fees charged, and how are unused funds handled when the run completes or fails?
7. What status lifecycle is exposed for Volume Bot: polling, webhooks, browser events, or a combination? What states and fields are available?
8. Is editing a running Volume Bot supported for MVP fields, or should edit remain out of scope?

## 5. Launch + Volume Sequence

1. Can Smithii support launch-to-volume sequencing without our backend holding keys or submitting delayed transactions?
2. For sequencing, does Smithii own the delayed trigger, does the browser need to stay open, or can a server-issued plan schedule it safely?
3. What are the failure semantics when launch succeeds but volume cannot start, launch fails before volume, or the user rejects the second signature?

## 6. Testing and Release

1. Is there a Smithii sandbox/devnet endpoint for these flows? If yes, what URL, supported flows, test wallet requirements, faucet steps, and mainnet differences should we use?
2. If there is no sandbox, what exact low-amount mainnet procedure do you recommend for first live tests?
3. What rate limits, retry headers, support contacts, and monitoring expectations apply during integration and closed beta?
