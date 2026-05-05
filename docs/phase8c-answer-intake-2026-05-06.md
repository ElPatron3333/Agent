# Smithii Answer Intake - 2026-05-06

Source: `E:\Desktop\smithii-integration-answers-final.md`
Repo commit reviewed against: `7a85977`
Decision summary: Bundle Launch and supported Pump Bundle Buy/Sell can move to browser-only handoff implementation; backend-keyed and unsupported flows stay blocked.

## Overall Decision

- Bundle Launch: live-eligible
- Bundle Swap SOL/token: live-eligible
- Bundle Swap token-to-token: blocked
- Volume Bot: blocked
- Launch + Volume: blocked

## Non-Negotiable Gate Result

- Zero custody confirmed for enabled flow(s): yes, if secondary wallet keys stay in browser memory only.
- Backend private keys required anywhere: no for Bundle Launch and supported Bundle Buy/Sell; yes for classic Volume Bot and multi-wallet Anti-MEV, so those remain blocked.
- Preview first + explicit confirm preserved: yes; implementation must keep our existing preview and confirmation gates.
- Test path available: low-amount mainnet only. No Smithii sandbox/devnet exists.
- Flows safe to implement now: Bundle Launch, Bundle Swap SOL-to-token, Bundle Swap token-to-SOL.

## Shared Contract Intake

| Question | Smithii answer | Status | Code decision |
|---|---|---|---|
| Browser module/API for zero-custody execution | Public `@smithii/sdk/pump` with `PumpFunClient`, wallet-adapter signer, `Connection`, `proxyUrl`, and Jito UUID. | answered | Add browser-only handoff contract for Pump flows. |
| Raw private-key requirements or zero-custody limits | Bundle secondary wallet keys can remain in browser memory. Backend-keyed flows exist and must be blocked. | answered | Backend must not receive private keys or private-key-shaped fields. |
| Partner auth/licensing model | No partner-only auth, domain lock, OAuth, or partner key found. Jito UUID and proxy URL are runtime config. | answered | Do not add partner auth gate for this package. |
| Backend-issued fields before browser execution | SDK does not require one, but Smithii recommends non-secret plan/audit fields. | answered | Issue/store only non-secret plan metadata. |
| Idempotency key and retry behavior | Pump SDK has no idempotency parameter. Agent should derive and bind its own idempotency key. | answered | Create local idempotency key from wallet, flow, params hash, nonce, and expiry. |
| Success/result fields per flow | Bundle Launch returns create tx signature, buyer tx signatures, bundle IDs, and payment signature. Bundle Buy/Sell returns bundle IDs, tx signatures, and payment signature. | answered | Result UI/audit must use only returned/verifiable fields. |
| Error states and retryability | SDK and backend errors vary. Smithii recommends app-owned normalized categories. | answered | Keep a local normalized error contract before live UI claims. |

## Bundle Launch Intake

| Question | Smithii answer | Status | Code decision |
|---|---|---|---|
| Metadata upload flow before `createAndSnipeToken` | Use `client.uploadMetadata(...)`; posts to `${proxyUrl}/pump.fun:443/api/ipfs`. | answered | Add browser handoff config for metadata upload. |
| Mint keypair generation and custody | Browser generates or uses pregenerated mint keypair; browser holds and signs with it. | answered | Mint secret must never touch backend. |
| Buyer wallet signer model | Connected wallet signs create/payment txs; secondary buyers are browser-held private keys used by SDK locally. | answered | Keep buyer key material browser-only. |
| Limits and fees | 16 launch buyers, 0.1 SOL service fee, 0.2 SOL pregenerated mint fee, 500000 lamport Jito tip, 10% buy slippage. | answered | Align preview validation/copy to these values before live test. |
| Success response | `createTxSignature`, `buyerTxSignatures`, `bundleIds`, `paymentSignature`; mint is mint keypair public key. | answered | Typed live result should expose these fields only. |
| Failed-launch funds and service fee | Payment transaction is sent only after create confirms; failed launch bundle should not charge service fee. Support handles recovery/refunds. | answered | Confirmation copy must state partial bundle/support risk. |

## Bundle Swap Intake

| Question | Smithii answer | Status | Code decision |
|---|---|---|---|
| Supported directions | SOL-to-token and token-to-SOL supported by Pump bundle method. Token-to-token not supported in reviewed Pump SDK flow. | answered | Enable supported directions only; keep token-to-token blocked. |
| Routing source of truth | Pump SDK resolves Pump.fun on-chain state; Jupiter/Smithii handles any Jupiter route flow. | answered | Do not expose custom live route override. |
| Quantity-mode mapping | Fixed buy and token amount sell are direct; total/random modes must be converted by UI/agent before execution. | answered | Browser handoff receives per-wallet amounts. |
| Per-transaction overrides | Custom slippage, gas, priority, Jito tip, delays, and MEV settings are not exposed. | answered | Hide/block live overrides for supported Pump bundle execution. |
| Atomicity or partial results | Atomic per Jito bundle; more than 5 wallets split into multiple bundles, so partial success is possible. | answered | Preview/audit must not claim all-wallet atomicity for more than 5 wallets. |
| Wallet cap | Current code allows 25 wallets. | answered | Align live validation to 25 for Bundle Buy/Sell. |

## Volume Bot Intake

Classic Volume Bot is blocked. Smithii confirmed it is implemented in `market_maker_bot_`, funded and executed by backend-managed bot/maker wallets, and is not wallet-adapter-only zero custody. Anti-MEV is a separate product; multi-wallet Anti-MEV sends private keys to a backend. Edit support remains out of scope.

## Launch + Volume Intake

Launch + Volume automation is blocked. Smithii did not find a single integrated launch-to-volume flow or scheduler/trigger contract. The safe MVP sequence is separate launch execution, launch confirmation, a new Volume Bot preview, and explicit second confirmation. Because classic Volume Bot is backend-keyed, no live Launch + Volume sequence is enabled in this package.

## Testing and Release Intake

- Sandbox/devnet endpoint: none.
- Low-amount mainnet procedure: use burner wallets; test metadata upload first; then Bundle Buy/Sell with one wallet; then Bundle Launch with low amounts and one or zero buyers.
- Rate limits: product answer says no limits, but `market_maker_bot_` has a start-maker in-memory limiter. This does not affect the enabled Pump bundle package.
- Monitoring allowed: flow, wallet public key, mint address, idempotency key, bundle IDs, tx signatures, payment signature, high-level error category.
- Never monitor/log: private keys, seed phrases, mnemonic phrases, secret-key arrays, private-key-shaped fields, or raw request bodies containing private keys.
