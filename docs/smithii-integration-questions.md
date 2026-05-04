# Smithii Integration Questions

Date: 2026-05-05
Owner: Smithii Agent integration
Repo phase: Phase 8B
Status: waiting for Smithii answers before live execution wiring

## Purpose

We have a mock-first Smithii Agent for Pump.fun flows: Bundle Launch, Bundle Swap, Volume Bot, and Launch + Volume sequencing. Phase 8A added a typed live-boundary classification, but the app still does not execute live Smithii calls.

This packet is the canonical list of Smithii answers required before we can safely wire Phase 8C live browser handoff.

## Non-Negotiable Constraints

- The backend must never receive, persist, proxy, or log private keys, seed phrases, or private-key-shaped request fields.
- Live execution must happen through a browser-side zero-custody handoff where the user controls signer material.
- Every execution path must keep preview first, then explicit user confirmation.
- `browser-handoff-ready` in our repo means a known SDK target exists. It does not mean production live execution is ready.
- The agent's capability must stay a strict subset of the Smithii Pro UI for Pump.fun.
- If Smithii does not expose a capability, the agent will keep that flow mocked or blocked.

## Current Local Classification

| Flow | Current state | Local SDK target | Main blocker |
|---|---|---|---|
| Bundle Launch | Browser handoff ready | `PumpFunClient.createAndSnipeToken` | Need browser tx assembly and metadata/mint flow contract. |
| Bundle Swap: SOL to token | Browser handoff ready | `PumpFunClient.bundleSellBuy` | Need browser tx assembly, routing, fee, and result contract. |
| Bundle Swap: token to SOL | Browser handoff ready | `PumpFunClient.bundleSellBuy` | Need browser tx assembly, routing, fee, and result contract. |
| Bundle Swap: token to token | Blocked awaiting Smithii | No confirmed SDK target | Need Smithii-supported path or confirmation that it is unavailable. |
| Volume Bot | Blocked awaiting Smithii | `AntiMEVClient.runSingle` partial | Need Pro Volume Bot mapping and lifecycle contract. |
| Launch + Volume sequence | Blocked awaiting Smithii | Composite | Need child-flow contracts and sequencing semantics. |

## Answer Format Requested

For each item, please provide one of these response types:

- `Supported`: include the exact browser API, input type, output type, errors, and limits.
- `Supported with changes`: include the required change and the contract we should implement.
- `Not supported`: say whether the feature is not exposed yet, intentionally private, or out of scope.
- `Needs meeting`: identify the specific missing decision so we can resolve it live.

## A. Shared Browser Handoff Contract

### A1. Browser module entry point

Question: What browser-side module should we call for zero-custody execution of Bundle Launch, Bundle Swap, and Volume Bot?

Why we need it: The public `@smithii/sdk` exposes some methods that accept private-key arguments. We need the browser execution shape that keeps those keys in user-controlled browser state and never posts them to our backend.

Expected answer: Package name, import path, initialization code, required provider/wallet adapter, and whether it is the public `@smithii/sdk`, a partner build, or a separate browser tx-assembly module.

### A2. Auth and license model

Question: How should the browser module authenticate and enforce partner access: domain lock, signed license, per-user key, OAuth, wallet signature, or another model?

Why we need it: We need to know what values our app must request from our backend and what values must stay in the browser.

Expected answer: Auth flow, token lifetime, origin restrictions, server-issued fields, and whether any secret must be stored in Vercel env.

### A3. Server-issued plan record

Question: Should our backend issue a signed plan record for each preview before browser execution, and what fields should it contain?

Why we need it: The app currently uses local pending-plan records for mock execution. Live execution should bind the browser handoff to a user/session/plan without carrying private keys.

Expected answer: Required plan fields, signature format, expiration, replay rules, and any Smithii-side verification endpoint.

### A4. Idempotency and duplicate confirmations

Question: What idempotency key should be sent for each execute handoff, and does Smithii dedupe duplicate execute attempts?

Why we need it: Users may double-click confirmation or retry after a network interruption. We need deterministic duplicate handling before live funds are at risk.

Expected answer: Idempotency key format, duplicate response behavior, retry window, and whether keys are per wallet, per plan, or per flow.

### A5. Error contract

Question: What normalized errors can the browser module return for rejected signatures, insufficient funds, expired quotes, rate limits, route changes, fee failures, and partial submission failures?

Why we need it: The agent needs to show precise failure states without inventing transaction results.

Expected answer: Error codes, retryability, user-facing message guidance, and whether any error can occur after a transaction is submitted.

### A6. Result contract

Question: What fields prove a live execution succeeded for each flow?

Why we need it: The agent must record only verifiable transaction outputs and must never invent mint addresses, signatures, bot IDs, or run IDs.

Expected answer: Success response fields for mint address, transaction signature, per-wallet result, bot/run ID, status URL, and fee proof.

## B. Bundle Launch

### B1. Metadata upload flow

Question: What exact metadata upload flow should the browser use before `PumpFunClient.createAndSnipeToken`?

Why we need it: Our preview has token name, symbol, description, image filename, and optional socials. We need to know whether Smithii uploads metadata, expects us to upload it, or provides a preflight endpoint.

Expected answer: Metadata endpoint or browser helper, required image constraints, returned metadata shape, validation rules, and failure modes.

### B2. Mint keypair and pregenerated token address

Question: Who generates and holds the mint keypair when `pregenerateTokenAddress` is enabled or disabled?

Why we need it: We must keep key material browser-side and understand whether the mint keypair is user-held, Smithii-generated, or returned as a signer object.

Expected answer: Keypair generation responsibility, storage lifetime, signer interface, and whether the backend ever sees any mint secret material.

### B3. Buyer signer material

Question: For bundle buyer wallets, does the browser module accept raw imported private keys, wallet adapter signers, encrypted local key objects, or another signer abstraction?

Why we need it: The current browser roster can import/export keys locally, but the backend sees only pubkeys and amounts.

Expected answer: Required signer representation, max wallet count, validation rules, and whether Smithii supports file-imported bundle wallets without backend custody.

### B4. Bundle Launch limits and fees

Question: What limits and fees does Smithii enforce for Bundle Launch today?

Why we need it: Our mock uses a maximum of 15 bundle wallets plus dev wallet and fee estimates. Live previews must match Smithii enforcement.

Expected answer: Wallet cap, minimum/maximum buy amount, service fee, pregeneration fee, Jito/priority fee controls, slippage support, and any social/image limits.

### B5. Bundle Launch success response

Question: What exact success response should we expect after a live launch?

Why we need it: The agent needs to display and audit verifiable outputs only.

Expected answer: Mint address, transaction signature(s), token URL if available, per-wallet result format, fee proof fields, and final status semantics.

## C. Bundle Swap

### C1. Supported directions

Question: Does Smithii expose a zero-custody token-to-token bundle swap path for Pro users?

Why we need it: Our mock can preview `token_to_token`, but Phase 8A blocks live handoff because `PumpFunClient.bundleSellBuy` only maps SOL/token and token/SOL in the checked SDK surface.

Expected answer: Supported directions, method name, input/output contract, or confirmation that token-to-token must stay blocked.

### C2. Routing authority

Question: Should live routing be selected by Smithii, by our Helius read, by the user, or by a Smithii-provided preflight call?

Why we need it: Our mock can label `pumpfun_bonding` or `pumpswap_amm`, but live execution must use Smithii's actual route resolution.

Expected answer: Routing source of truth, route enum values, preflight quote fields, stale route behavior, and whether `pool` is accepted or ignored by the SDK.

### C3. Quantity modes

Question: How do Smithii Pro quantity modes map to live Bundle Swap inputs?

Why we need it: The agent supports total SOL, fixed per transaction SOL, random SOL range, and random percentage range.

Expected answer: Exact input fields, units, rounding, minimums, maximums, and unsupported modes.

### C4. Per-transaction overrides

Question: Which per-transaction overrides are supported for Bundle Swap: slippage, gas, priority, MEV shield, Jito tip, or delay blocks?

Why we need it: Our preview can collect some settings, but the live contract must match Smithii Pro behavior exactly.

Expected answer: Supported fields, defaulting rules, max/min values, and whether unsupported fields should be hidden before live launch.

### C5. Atomicity and partial results

Question: Is Bundle Swap atomic across participating wallets, or can some wallet swaps succeed while others fail?

Why we need it: The plan currently assumes atomic failure means nothing executed. If live behavior differs, the confirmation copy and audit log must change.

Expected answer: Atomicity guarantee, per-wallet result format, rollback/no-rollback behavior, and retry guidance.

### C6. Wallet cap

Question: What wallet cap does Smithii enforce for Bundle Swap today: 20, 25, or another number?

Why we need it: The partner conversation and UI references have differed. The agent must enforce the same cap as Smithii.

Expected answer: Exact cap, whether it differs by route/direction, and whether caps are hard errors or warnings.

## D. Volume Bot

### D1. Pro Volume Bot product mapping

Question: Does `AntiMEVClient.runSingle` exactly power Smithii Pro Volume Bot, or is it a separate Anti-MEV volume product?

Why we need it: The public SDK method only partially maps our Volume Bot preview. We must not wire the wrong product surface.

Expected answer: Product mapping, correct SDK/module path, and whether Pro Volume Bot has a separate partner/browser API.

### D2. Field mapping

Question: Where do these Volume Bot fields map in the live Smithii contract: `onPurchase`, `sellTiming`, `sellMode`, and `sellStrategy`?

Why we need it: These are core MVP controls. The checked SDK v0.2.0 type surface does not expose a clear mapping.

Expected answer: Exact enum values, unsupported combinations, defaults, validation rules, and whether `sell_100` and one-leg `sell_strategy` are both supported.

### D3. Wallet model

Question: Can Smithii provide a zero-custody multi-wallet Volume Bot flow, or is multi-wallet volume intentionally backend-keyed?

Why we need it: `AntiMEVClient.runMultiple` sends private keys to a backend. That violates our architecture.

Expected answer: Supported zero-custody wallet model, signer representation, maximum wallets, or confirmation that multi-wallet Volume Bot must stay blocked.

### D4. Fee funding

Question: Which wallet pays Volume Bot fees, when are fees charged, and how are unused funds handled when the run completes or fails?

Why we need it: The current mock previews estimated total fees and service fee. Live user copy must match actual payment behavior.

Expected answer: Fee payer, fee timing, refund/no-refund rules, balance requirements, and proof fields.

### D5. Status lifecycle

Question: What status lifecycle is exposed for Volume Bot: polling, webhooks, browser events, or a combination?

Why we need it: The app currently has mock status and pause. Live status should not guess run state.

Expected answer: States, polling endpoint or event API, rate limits, pause/resume support, terminal states, and fields for makers done, volume done, and SOL consumed.

### D6. Edit support

Question: Is editing a running Volume Bot supported for MVP fields, or should edit remain out of scope?

Why we need it: The current plan treats edit as unsupported unless Smithii exposes it.

Expected answer: Supported edit fields if any, update endpoint, state restrictions, and whether edits need a new signature.

## E. Launch + Volume Sequence

### E1. Sequencing ownership

Question: Can Smithii support launch-to-volume sequencing without backend private-key custody?

Why we need it: Our mock can queue a sequence locally, but production sequencing must not depend on our backend holding keys or submitting later transactions.

Expected answer: Whether Smithii owns the delayed trigger, whether the browser must stay open, whether a server-issued plan can schedule it, and what happens if launch succeeds but volume cannot start.

### E2. Failure boundaries

Question: What are the live failure semantics for launch succeeded but volume not started, launch failed before volume, or user rejects the second signature?

Why we need it: The agent must explain sequence outcomes accurately and audit partial completion.

Expected answer: Status states, recoverability, retry flow, and user-facing response guidance.

## F. Sandbox and Release Procedure

### F1. Test environment

Question: Is there a Smithii sandbox/devnet endpoint for these flows?

Why we need it: We need end-to-end verification without risking real funds where possible.

Expected answer: Sandbox URL, supported flows, test wallet requirements, faucet instructions, and differences from mainnet.

### F2. Mainnet low-amount procedure

Question: If no sandbox exists, what exact low-amount mainnet procedure does Smithii recommend for the first live tests?

Why we need it: We need a controlled acceptance test before beta.

Expected answer: Minimum safe amounts, recommended wallet counts, fee expectations, rollback expectations, and Smithii monitoring contact.

### F3. Rate limits and support

Question: What rate limits, operational alerts, and support contacts apply during integration and closed beta?

Why we need it: Volume Bot and repeated previews may hit API or transaction limits.

Expected answer: Rate limit values, retry headers, escalation channel, incident expectations, and beta monitoring requirements.

## G. Phase 8C Entry Criteria

We can start Phase 8C live browser handoff only when the following are answered clearly:

1. Browser module/API shape for at least one flow.
2. Auth/license model and server-issued fields.
3. Idempotency and duplicate confirmation behavior.
4. Success/error/result contracts for the target flow.
5. Fee enforcement and proof fields.
6. Sandbox or approved low-amount mainnet test procedure.
7. Confirmation that the backend never needs private keys or private-key-shaped payloads.

If only Bundle Launch and SOL/token Bundle Swap are answered, Phase 8C should enable only those flows. Token-to-token, Volume Bot, and Launch + Volume must remain blocked until their answers are complete.