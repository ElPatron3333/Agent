# Smithii Next Tools Question Pack

Date: 2026-05-06
Status: ready to send
Related registry: `src/lib/smithii/capability-registry.ts`
Related onboarding template: `docs/smithii-tool-onboarding-template.md`

## Goal

We finished the zero-custody browser execution foundation for Pump Bundle Launch and Pump Bundle Swap. Before choosing the next Smithii tool to integrate, we need Smithii to confirm which available tools can fit the same agent model:

- preview first
- explicit user approval
- browser/user wallet controls signer material
- our backend never receives private keys, seed phrases, private-key arrays, or private-key-shaped fields
- success/error results expose public, auditable fields only

We are not assuming Bonk, Bags, or any specific launchpad is next. Maker/Taker may be the next product priority, but we need Smithii to map that product to the actual available SDK/client/endpoint first.

## 1. Please Rank The Next Available Tools

Which Smithii tools are available now, or closest to available now, for a zero-custody browser integration like our Pump flow?

Please rank the top 3 to 5 candidates from Smithii's side and include:

| Tool/product | Available now? | SDK/client or endpoint | Browser-supported? | Zero-custody? | Main blocker, if any | Recommended first live test |
|---|---|---|---|---|---|---|
|  | yes/no/partial |  | yes/no/partial | yes/no/partial |  |  |

Candidate pool we know about from the SDK/registry:

- Maker/Taker Bot or Market Maker
- PumpSwap graduated-token Bundle Swap
- Moonit launch or swap
- LaunchLab / Bonk launch bundles
- Bags launchpad or Bags bundles
- Mantis launchpad
- Token Manager post-launch ops
- Multisender / Airdrop
- Token Creator
- Vesting / Claim
- Anti-MEV single-wallet
- Payment / plan lookup, if useful as read-only support

If a different Smithii tool is a better next fit, please add it.

## 2. Maker/Taker Bot / Market Maker

This is probably the next product direction, but we do not know the exact Smithii product mapping.

1. Is Smithii's Maker/Taker Bot the same product as `@smithii/sdk/market-maker` `MarketMakerClient.deposit`, or a different product/API?
2. If it is different, what is the exact package, subpath import, client constructor, method names, or HTTP endpoint set?
3. Is it supported in a browser runtime with wallet-adapter style signing, or does it require backend orchestration?
4. Does any Maker/Taker flow require private keys, seed phrases, generated bot wallet keys, delegated authority, or encrypted key material to leave the user's browser/wallet?
5. Who controls the deposited SOL/token funds after `deposit`: user's wallet, Smithii vault/program, generated bot wallets, or another custody model?
6. What can the user do after deposit: start, stop, withdraw, pause, resume, edit, view status, or recover unused funds?
7. What exact inputs are required: token mint, deposit amount, fee amount, maker count, taker count, buy/sell ranges, delay ranges, strategy settings, pool/DEX, slippage, Jito settings, or anything else?
8. What fees are charged, when are they charged, and what happens if the run fails before any trading happens?
9. What success fields are returned and safe to show/audit: deposit signature, vault address, run ID, bot ID, status URL, payment signature, bundle IDs, tx signatures?
10. What error states can happen: insufficient funds, token not tradable, deposit failed, bot start failed, partial run, rate limited, stopped, expired, refund pending, or support-required?
11. Is there an event/status API we should poll or subscribe to? Please include states, fields, polling interval, and terminal states.
12. What is the lowest-risk live acceptance procedure for a first Maker/Taker test, including minimum SOL/token amount and recommended token/pool?

## 3. Anti-MEV Single-Wallet

We see `@smithii/sdk/anti-mev` `AntiMEVClient.runSingle`, but it appears to be a backend-orchestrated product after user deposit and not the same as classic Volume Bot.

1. Is Anti-MEV single-wallet a product Smithii recommends integrating next, or should it stay separate from the agent's launch/trading roadmap?
2. Does `runSingle` ever require our backend or Smithii to receive private keys or delegated custody material?
3. What happens to deposited funds during and after the run?
4. What status/history fields are available and safe to show?
5. What first low-amount live test does Smithii recommend?

## 4. PumpSwap Graduated-Token Bundle Swap

This looks technically close to the Pump Bundle Swap path, but we do not want to assume routing or eligibility.

1. Should graduated PumpSwap tokens use `@smithii/sdk/pumpswap` `PumpSwapClient`, or `PumpFunClient.bundleSellBuy` with `pool: "pump-amm"`?
2. How should we detect or confirm that a target mint is eligible for PumpSwap bundle swap?
3. Are result fields and error states the same as Pump `bundleSellBuy`?
4. Are wallet caps, fees, Jito settings, slippage, and retry rules the same as Pump bundle swap?
5. What is the lowest-risk live test procedure?

## 5. Moonit / LaunchLab / Bonk / Bags

These may be technically available, but they are not automatically our next priority. We need to know whether Smithii considers any of them a better next integration than Maker/Taker.

1. Which of these are production-ready for browser zero-custody integration today?
2. For each ready tool, what exact package/subpath/client/method should we use?
3. Does the tool require browser-held buyer keys, wallet-adapter signers only, pre-uploaded metadata URI, base64 icon data, or another signer/metadata model?
4. Are there any backend-keyed or private-key-submission paths we must keep blocked?
5. What are the wallet caps, fees, metadata requirements, success fields, error states, and first low-amount test path?
6. For Bags specifically, is there an SDK/client surface available now? If yes, please provide the import path and method names.

## 6. Lower-Risk Utility Tools

If Smithii thinks execution-heavy tools should wait, which utility tool is safest and most useful to integrate next?

Please answer for Token Manager, Multisender, Token Creator, Vesting, Claim, and Payment/plan lookup only if Smithii recommends one as a near-term integration.

For the recommended utility tool:

1. Exact SDK package, subpath import, client, and methods.
2. Browser/runtime support and signer shape.
3. Whether any backend service stores request details, recipient lists, metadata, or payment records.
4. Required runtime config values and whether any are public or secret.
5. Exact success/error fields safe for user display and audit.
6. First low-risk live test procedure.

## 7. Required Answer Format

Please return:

1. A ranked list of next recommended tools.
2. For each ranked tool: available now / partial / blocked.
3. For Maker/Taker specifically: exact product-to-SDK/API mapping and custody model.
4. Any flows that must stay blocked because they require backend key custody.
5. The first low-risk live acceptance procedure for the top recommended tool.

If any answer is unknown or not ready, please mark it `not available yet` instead of letting us infer behavior.
