# Future Smithii Tool Readiness Matrix

Date: 2026-05-06
Status: planning aid only; no new live execution paths enabled
Primary source: local `smithii-sdk` skill and Smithii Phase 8 answer intake
Current implementation baseline: Pump Bundle Launch and supported Pump Bundle Swap are the only browser-live-eligible flows in this repo.

## Purpose

This matrix prepares future Smithii integrations without guessing live behavior. It classifies each candidate tool by SDK surface, custody model, runtime config, metadata needs, and what must be proven before implementation.

This document does not authorize implementation. A tool moves into build scope only after its row has a confirmed zero-custody path, preview model, result/error contract, and live-test plan.

## Status Labels

| Status | Meaning | Implementation rule |
|---|---|---|
| `implemented-awaiting-live-acceptance` | Built in this repo, but not yet accepted on mainnet. | Do not start beta until live acceptance passes. |
| `near-reuse-after-pump-live` | SDK contract is close to current Pump browser flow. | Start only after Pump live acceptance proves runtime assumptions. |
| `contract-known-needs-spec` | SDK surface is documented enough for a design/spec, but not enough to wire live execution yet. | Create a spec and focused Smithii question packet before coding. |
| `needs-smithii-answer` | No verified SDK/client contract in current local docs. | Ask Smithii before any implementation. |
| `blocked-custody` | Current known path sends private keys to a backend or requires backend custody. | Keep blocked unless Smithii provides a zero-custody alternative. |
| `defer-non-mvp` | Possible later, but outside the Pump launch-agent wedge. | Do not prioritize before launchpad/bundler expansion. |
| `read-only-support` | Useful for discovery/status but not an execution flow. | Can be added as helper UI after execution flows are stable. |

## Non-Negotiable Gates For Every New Tool

- Browser/user signer material stays in the browser or wallet adapter unless the tool is explicitly classified as non-custodial without local key material.
- Our backend never receives, proxies, stores, logs, or reflects private keys, seed phrases, private-key arrays, or private-key-shaped fields.
- Every execution path keeps preview first, explicit approval second, live submit third.
- Runtime config is validated before live submit.
- Result UI and audit logs include only public/verifiable fields such as wallet pubkey, mint, tx signatures, bundle IDs, payment signatures, and high-level error categories.
- Unsupported or partially understood flows remain blocked or mocked.
- Every new tool gets one scoped SMAC before merge/live acceptance.

## Candidate Tool Matrix

| Candidate tool | SDK/client surface | Current status | Custody classification | Runtime config likely needed | Signer model | Private-key risk | Metadata/upload needs | Current infra reuse | Main blocker before implementation | First acceptance path |
|---|---|---|---|---|---|---|---|---|---|---|
| Pump Bundle Launch | `@smithii/sdk/pump` `PumpFunClient.createAndSnipeToken` | `implemented-awaiting-live-acceptance` | Browser-held secondary keys; backend zero-custody | Solana RPC, Smithii proxy URL, Jito UUID, plan signing secret | Wallet adapter signer plus browser-held buyer keys | Buyer keys are local browser/runtime material only; backend must never see them | `PumpFunClient.uploadMetadata(...)` before create | Existing Phase 8 browser signer, preflight, runbook, packet prep, live submit | Live Jito UUID and operator materials | Low-amount mainnet Bundle Launch after metadata upload succeeds |
| Pump Bundle Swap | `@smithii/sdk/pump` `PumpFunClient.bundleSellBuy` | `implemented-awaiting-live-acceptance` | Browser-held participating wallet keys; backend zero-custody | Solana RPC, Smithii proxy URL, Jito UUID, plan signing secret | Wallet adapter signer plus browser-held participating keys | `privKeys[]` must stay in browser/local runtime only | None | Existing Phase 8 browser signer, preflight, runbook, packet prep, live submit | Live Jito UUID and operator materials | Low-amount mainnet SOL-to-token with one burner wallet |
| PumpSwap graduated token bundle swap | `@smithii/sdk/pumpswap` alias or `bundleSellBuy` with `pool: 'pump-amm'` | `near-reuse-after-pump-live` | Likely same as Pump Bundle Swap | Same as Pump Bundle Swap | Same as Pump Bundle Swap | Same `privKeys[]` browser-only risk | None | Strong reuse of Bundle Swap preview/packet path if routing and pool eligibility are explicit | Need post-Pump-live spec for pool detection, target eligibility, and result parity | Low-amount PumpSwap token buy/sell with one burner wallet |
| Bonk / LetsBonk launch bundle | `@smithii/sdk/launchpad` `BonkClient.createAndSnipe` | `near-reuse-after-pump-live` | Browser-held buyer keys; backend zero-custody if SDK runs in browser as documented | Solana RPC, Jito UUID, possibly proxy/base URL if constructor supports it | Wallet adapter signer plus browser-held buyer keys | Buyers use `{ pk, amount }`; keys must remain browser-only | Caller must pre-upload metadata URI; no SDK upload helper documented | Reuse launch preview, buyer roster, mint keypair custody, approval gate, result display patterns | Need exact metadata URI ownership/upload path, proxy handling, fees, result fields, and low-amount procedure | Low-amount Bonk create-and-snipe with one buyer after metadata URI preflight |
| Raydium LaunchLab launch bundle | `@smithii/sdk/launchpad` `LaunchlabClient.createAndSnipe` | `near-reuse-after-pump-live` | Browser-held buyer keys; backend zero-custody if SDK runs in browser as documented | Solana RPC, Jito UUID, possibly proxy/base URL if constructor supports it | Wallet adapter signer plus browser-held buyer keys | Buyers use `{ pk, amount }`; keys must remain browser-only | Caller must pre-upload metadata URI; no SDK upload helper documented | Reuse launch preview, buyer roster, mint keypair custody, approval gate, result display patterns | Need exact metadata URI upload path, fees, result fields, platform limits, and low-amount procedure | Low-amount LaunchLab create-and-snipe with one buyer after metadata URI preflight |
| Moonit launch bundle | `@smithii/sdk/moonit` `MoonitClient.createAndSnipe` | `contract-known-needs-spec` | Browser-held buyer keys; likely browser-live possible, needs confirmation | Solana RPC, Jito UUID | Wallet adapter signer plus browser-held buyers | Buyers use `{ pk, amount }`; max creation buyers differs from Pump | Metadata is nested under `mint`; icon is a base64 data string, not `File`/`Blob` | Reuse approval/result shell; requires separate metadata model and amount semantics | Need Moonit-specific preview fields, token amount semantics, limits, fees, result/error contract | Low-amount Moonit launch with one buyer after base64 icon validation |
| Moonit bundle swap | `@smithii/sdk/moonit` `MoonitClient.bundleSwap` | `contract-known-needs-spec` | Browser-held buyer keys; likely browser-live possible, needs confirmation | Solana RPC, Jito UUID | Wallet adapter signer plus browser-held buyers | Buyers use `{ pk, amount }`; max swap wallets differs from Pump | None | Reuse swap approval/result shell; requires direction and amount mapping changes | Direction is uppercase `BUY`/`SELL`; mint is string; wallet caps and amount semantics differ | Low-amount Moonit BUY or SELL with one burner wallet |
| Bags launchpad / Bags bundles | Unknown in current local Smithii docs | `needs-smithii-answer` | Unknown | Unknown | Unknown | Unknown | Unknown | Only generic preview/approval architecture can be reused | Need exact SDK package/import path, signer model, metadata flow, fees, limits, result/error contract | None until Smithii provides contract |
| Maker/Taker bot | Unknown as a named SDK surface in current local docs; may overlap Market Maker or Volume Bot product | `needs-smithii-answer` | Unknown | Unknown | Unknown | Unknown | Unknown | Only generic preview/approval architecture can be reused | Need Smithii to map product name to SDK/client/endpoints and custody model | None until product mapping is answered |
| Market Maker deposit | `@smithii/sdk/market-maker` `MarketMakerClient.deposit` | `contract-known-needs-spec` | Deposit-style flow; custody/status model needs review | Solana RPC; may require Smithii backend depending SDK internals | Wallet adapter signer for deposit | No direct private-key array in documented deposit call, but bot custody/status must be verified | None | Reuse signer, preview totals, explicit approval, result/audit shell | Need vault custody, withdrawal/refund, run status, stop/edit semantics, and whether this maps to desired Maker/Taker bot | Low-amount deposit only after refund/status contract is documented |
| Classic Volume Bot | Smithii answer says `market_maker_bot_` HTTP endpoints | `blocked-custody` | Backend-managed bot/maker wallets | Smithii bot backend URL and payment signature | Connected wallet funds/signs payment, backend creates/uses maker wallets | Backend-keyed execution; not wallet-adapter-only zero custody | None known | Preview UX can be reused only for blocked/mock state | Current Smithii answer says backend-keyed; zero-custody alternative required | None under current constraints |
| Anti-MEV single-wallet | `@smithii/sdk/anti-mev` `AntiMEVClient.runSingle` | `contract-known-needs-spec` | Backend orchestrates after user deposit; not client-side bundle | Solana RPC, `BOTS_API_URL` | Wallet adapter signer deposits/funds run | No multi-wallet key array in single-wallet call, but backend execution/refund semantics matter | None | Reuse preview, explicit approval, result/audit shell if deposit contract is acceptable | Need product fit, refund behavior, status lifecycle, and whether it is acceptable for MVP | Low-amount single run after status/refund contract is documented |
| Anti-MEV multi-wallet | `@smithii/sdk/anti-mev` `AntiMEVClient.runMultiple` | `blocked-custody` | Backend receives private keys | Solana RPC, `BOTS_API_URL` | Backend orchestration with submitted `privateKeys[]` | Direct private-key backend submission | None | Keep blocked; no live reuse under current zero-custody rule | Requires Smithii zero-custody alternative | None under current constraints |
| Mantis launchpad | `@smithii/sdk/mantis` `MantisClient` | `contract-known-needs-spec` | Wallet-adapter signer for launch/buy/claim paths as documented; needs review | Solana RPC | Wallet adapter signer | No private-key arrays shown in local docs | Launch config, phases, hardcap/softcap; metadata assumptions need review | Reuse signer, preview, approval, result/audit shell; likely a separate product UX | Need full launch lifecycle, payment methods, edit/claim/withdraw status, fees, and live acceptance plan | Low-amount Mantis initialize/buy only after lifecycle spec |
| Token Creator | `@smithii/sdk/token-creator` `TokenCreatorClient.createToken` | `defer-non-mvp` | Wallet signer plus Smithii backend helper; needs custody check | Solana RPC, `BOTS_API_URL` | Wallet adapter signer | No private-key arrays shown; backend/payment behavior must be reviewed | Uses image `Blob`/`File`; metadata upload handled by client/backend | Reuse metadata image picker, signer, preview/approval shell | Not a launchpad bundler; needs separate product priority and fee/result contract | Low-amount token create after custody/backend review |
| Token Manager post-launch ops | `@smithii/sdk/token-manager` | `defer-non-mvp` | Wallet signer; no private-key arrays shown | Solana RPC; Helius RPC for NFT snapshot | Wallet adapter signer | Low direct key risk if signer-only | Existing token metadata snapshot can be required | Reuse signer, preview, approval, audit shell | Needs operation-by-operation authority checks and result contracts | Single low-risk revoke/snapshot op after spec |
| Multisender / airdrop | `@smithii/sdk/multisender` | `defer-non-mvp` | Wallet signer plus backend helper; needs custody and saved-details review | Solana RPC, `BOTS_API_URL`, optional LUT | Wallet adapter signer | Recipient list is public; no private-key arrays shown | CSV/list upload, token metadata | Reuse CSV import patterns, preview totals, approval shell | Need backend storage behavior, failed-wallet contract, schedule custody semantics | Small airdrop after backend/storage review |
| Token Vesting | `@smithii/sdk/token-vesting` | `defer-non-mvp` | Wallet signer | Solana RPC | Wallet adapter signer | No private-key arrays shown | Receiver list and schedule validation | Reuse preview/approval/audit shell | Needs vesting lifecycle and claim-state result contract | Small vesting schedule after spec |
| Token Claim | `@smithii/sdk/token-claim` | `defer-non-mvp` | Wallet signer | Solana RPC | Wallet adapter signer | No private-key arrays shown | Receiver list and end-date validation | Reuse preview/approval/audit shell | Needs receiver validation and claim lifecycle contract | Small claim setup after spec |
| Payment / plan lookup | `@smithii/sdk/payment` `PaymentClient` | `read-only-support` | Read-only | Solana RPC | No signer for read-only lookups | No private-key risk if read-only | None | Can support user plan/fee display later | Need decide whether product wants Smithii plan/referral display | Read-only query only; no live acceptance spend |
| EVM token tools | `@smithii/sdk/evm/*` | `defer-non-mvp` | EVM wallet client; separate chain/runtime | EVM RPC, wallet client, project ID | Viem wallet client | EVM private-key/account handling must stay wallet/provider-side | Token metadata and bytecode requirements | Reuse preview/approval pattern conceptually, not Solana adapter code | Separate chain architecture and payment/project ID requirements | Testnet or low-amount EVM deploy after separate phase |
| SUI token/snapshot tools | `@smithii/sdk/sui/*` | `defer-non-mvp` | SUI signer/backend depending tool | SUI network/API base URL | SUI signer | SUI signer custody rules differ from Solana | Tool-specific | Reuse product process, not Solana implementation | Separate chain architecture and backend snapshot payment behavior | Testnet/mainnet tiny run after separate phase |

## Reuse Map From Current Phase 8 Infra

| Existing component/process | Reusable for future tools | Notes |
|---|---|---|
| Browser wallet signer adapter | Solana signer-based tools | Needs per-client constructor adapters; do not pass private key strings as signers. |
| Wallet roster CSV and local `.smithii-local/` workspace | Bundlers needing secondary browser-held keys | Only for tools where Smithii confirms secondary keys stay browser-local. |
| Preview-first chat flow | All execution tools | Each tool needs its own typed preview and exact fee/limit mapping. |
| Explicit live submit approval | All execution tools | Keep disabled for blocked/unknown tools. |
| Browser handoff config/preflight | Jito bundlers and browser SDK tools | Extend only after env requirements are known. |
| Result/error normalization | All tools | Each tool needs a local result type with only public/verifiable fields. |
| SMAC + cleanup-orchestrator process | All phases | One scoped audit per new tool phase before merge/live acceptance. |
| Low-amount live runbook pattern | Live-eligible tools | Each tool needs a separate acceptance runbook or section with pass/fail criteria. |

## Recommended Integration Order After Pump Live Acceptance

1. PumpSwap graduated-token Bundle Swap: closest to existing Bundle Swap path.
2. Bonk or LaunchLab launch bundle: closest to existing Bundle Launch path, but needs metadata URI handling.
3. Moonit launch/swap: similar bundler concept, but metadata and direction semantics differ.
4. Market Maker or Anti-MEV single: only after custody/refund/status lifecycle is fully answered.
5. Mantis or broader token-management tools: separate product surfaces after launchpad/bundler expansion is stable.
6. Bags, Maker/Taker, and any unlisted named Smithii product: ask Smithii for exact SDK/client mapping first.

## Questions To Ask Before A New Tool Leaves Planning

For any candidate tool, ask Smithii for:

1. Exact package, subpath import, client constructor, and supported browser/runtime.
2. Whether any private keys, seed phrases, or private-key arrays ever leave the browser.
3. Required runtime env values and whether any are browser-public.
4. Wallet adapter signer requirements: `publicKey`, `signTransaction`, `signAllTransactions`, or another shape.
5. Exact input fields, caps, defaults, fees, and unsupported Pro UI options.
6. Metadata/image/upload flow and whether it is caller-owned or SDK-owned.
7. Success result fields and which ones are safe to display/audit.
8. Error classes/states, retry rules, partial success semantics, and refund/support path.
9. Idempotency/replay expectations if duplicate live submissions happen.
10. Recommended low-amount mainnet test procedure if no sandbox exists.

## Memory Guidance

Keep this document as the durable source of truth. If we save anything to persistent memory, save only the reusable rule:

`Before adding a new Smithii tool, classify it in docs/future-smithii-tool-readiness-matrix.md and keep it blocked until zero-custody, runtime config, result/error contract, and low-amount acceptance path are answered.`

Do not save runtime values, private keys, Jito UUIDs, burner wallet paths, launch images, or live test artifacts to memory.
