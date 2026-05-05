# Phase 8C Readiness Matrix

Date: 2026-05-06
Status: Smithii answers received; Phase 8C-A browser handoff package in progress
Source packet: `docs/smithii-integration-questions.md`
Answer intake runbook: `docs/phase8c-answer-intake-runbook.md`
Test coverage audit: `docs/phase8c-test-coverage-audit.md`
Dated intake: `docs/phase8c-answer-intake-2026-05-06.md`

## Purpose

This document is the intake checklist for Smithii's answers. It tells us when a flow is safe to move from mock/blocked behavior into Phase 8C live browser handoff work.

It does not define any Smithii API contract. Unknown details stay unknown until Smithii answers them.

## Non-Negotiable Gates

Every live-enabled flow must satisfy all gates below:

| Gate | Required evidence | Blocks if missing |
|---|---|---|
| Zero custody | Smithii confirms the browser/user controls signer material and our backend never receives private keys, seed phrases, or private-key-shaped fields. | All live execution for that flow. |
| Browser execution target | Exact package/module/API, import path, initialization, provider/wallet requirements, and input/output types. | Implementation of browser handoff. |
| Auth/licensing | Clear partner auth model, token/license shape, origin/domain rules, expiration, and server-issued fields. | Production access and preview-to-execute binding. |
| Preview binding | Smithii confirms whether we need a signed preview/plan record, quote ID, expiry, replay protection, or equivalent. | Safe confirmation flow. |
| Idempotency | Duplicate confirmation/retry behavior and idempotency key scope are defined. | Live execute button enablement. |
| Result contract | Success fields are defined and verifiable. | Audit log and user-facing success messages. |
| Error contract | Rejection, insufficient funds, expired quote, rate limit, route change, fee failure, partial submission, and post-submit failure states are defined. | User-facing failure messages and retry rules. |
| Fees and limits | Service fees, wallet caps, min/max amounts, priority/Jito controls, and proof fields are defined. | Accurate preview totals and validation. |
| Test path | Sandbox/devnet or approved low-amount mainnet procedure is defined. | First live test and beta readiness. |

## Answer Intake Status

Use this table when Smithii responds. Status values: `not received`, `answered`, `partial`, `blocked`, `needs meeting`.

| Area | Current status | Required answer | Unlocks | Code areas likely affected | Acceptance checks |
|---|---|---|---|---|---|
| Browser execution module | answered | Public `@smithii/sdk/pump` for Bundle Launch and supported Bundle Buy/Sell. Classic Volume Bot uses backend endpoints and is blocked. | Pump browser handoff package. | `src/lib/smithii/*`, client execution UI, API response metadata. | Backend still rejects private-key-shaped fields; no server live SDK call. |
| Raw key requirements | answered | Bundle secondary wallet keys may stay in browser memory; backend-keyed flows are blocked. | Zero-custody eligibility per flow. | Request validation, browser wallet roster, live-boundary classification. | Server tests prove private keys are rejected and not reflected in responses. |
| Auth/licensing | answered | No partner-only auth found; runtime config needs RPC URL, Smithii proxy URL, and Jito UUID. | Browser handoff config. | Env validation, browser handoff state. | Missing config keeps live handoff disabled. |
| Preview/plan binding | answered | Pump SDK does not need backend execution object; agent should issue non-secret plan/audit metadata. | Safe preview-to-confirm handoff. | Pending plan store, plan signing, confirmation metadata. | Expired/tampered plans fail before execution. |
| Idempotency | answered | Pump SDK has no idempotency parameter; agent derives a local idempotency key. | Safe execute retries. | Browser handoff plan, confirmation button state, audit log. | Double-confirm test has deterministic handling. |
| Success/result contract | answered | Bundle Launch and Bundle Buy/Sell result fields are defined. | Audit log and user-facing success messages. | Result types, chat response rendering, audit log schema. | UI displays only returned/verifiable values. |
| Error contract | answered | Raw errors vary; app-owned normalized categories are required. | Failure UI and retry policy. | Error mapping, chat response copy, audit records. | Known failures produce specific messages; unknown failures stay generic and non-invented. |
| Sandbox/mainnet test path | answered | No sandbox; use approved low-amount mainnet procedure with burner wallets. | First live acceptance test. | Test docs, env setup, runbook. | No beta/live claim until test path passes. |

## Flow Readiness Matrix

### Bundle Launch

Current decision: live-eligible for browser-only implementation. First live test still requires runtime config, burner wallets, and explicit low-amount mainnet approval.

| Requirement | Smithii answer needed | Decision rule |
|---|---|---|
| Browser launch API | Module/API for `createAndSnipeToken` or equivalent zero-custody launch. | Enable only if browser/user signer model is explicit. |
| Metadata upload | Exact metadata upload/preflight flow and returned fields. | Keep metadata mocked/blocked if upload ownership is unclear. |
| Mint keypair | Who generates, holds, and signs with the mint keypair. | Block if any mint secret must touch our backend. |
| Buyer signers | Supported signer model and wallet cap. | Enable only supported signer model and cap. |
| Fees/limits | Service fee, pregeneration fee, min/max buy, Jito/priority controls, slippage, image/social limits. | Preview must match Smithii enforcement before live confirm. |
| Failed launch recovery | What happens to funds and the 0.10 SOL service fee if launch fails. | Confirmation copy must state the exact refund/recovery behavior. |
| Result/error contract | Success fields and all failure states. | Audit must store only Smithii-returned verifiable fields. |

### Bundle Swap

Current decision: SOL-to-token and token-to-SOL are live-eligible for browser-only implementation. Token-to-token stays blocked.

| Requirement | Smithii answer needed | Decision rule |
|---|---|---|
| Supported directions | SOL-to-token, token-to-SOL, and token-to-token support. | Enable only answered/supported directions; keep token-to-token blocked if unsupported. |
| Routing source | Smithii routing, Helius read, user selection, or Smithii quote/preflight. | Use only Smithii-approved routing source for live execution. |
| Quantity modes | Mapping for total SOL, fixed SOL, random SOL range, random percentage range, and token amount modes. | Hide or block unsupported quantity modes before live confirm. |
| Overrides | Slippage, gas, priority fee, MEV shield, Jito tip, delay blocks. | Expose only supported overrides. |
| Atomicity | Whether all wallets succeed/fail together or partial success is possible. | Preview/audit copy must match actual atomicity. |
| Wallet cap | Exact enforced cap. | Validation must use Smithii's enforced cap. |
| Result/error contract | Per-wallet result and failure states. | Audit must record per-wallet outcomes if partial results are possible. |

### Volume Bot

Current decision: blocked. Smithii confirmed classic Volume Bot is backend-keyed and Anti-MEV is a separate product.

| Requirement | Smithii answer needed | Decision rule |
|---|---|---|
| Product mapping | Whether `AntiMEVClient.runSingle` is Smithii Pro Volume Bot or a separate product. | Do not wire if it is not the Pro Volume Bot surface. |
| SDK/module version | Correct SDK version, endpoint, or browser module. | Wait if current SDK does not expose the required product. |
| Field mapping | `onPurchase`, `sellTiming`, `sellMode`, `sellStrategy`. | Enable only fields with exact live mappings. |
| Randomize semantics | Whether `AntiMEVSingleConfig.randomize` affects direction only or also amount/delay/wallet behavior. | Do not map randomness beyond confirmed behavior. |
| Wallet model | Zero-custody multi-wallet support or backend-keyed only. | Block multi-wallet live volume if backend-keyed. |
| Fees/funds | Fee payer, charge timing, unused funds, refund/no-refund behavior. | Preview must match actual fee/funding behavior. |
| Status lifecycle | Polling/webhooks/events, states, fields, pause/resume support. | Status UI must use real states only. |
| Edit support | Supported edit fields and signing rules. | Keep edit out of scope unless explicitly supported. |

### Launch + Volume Sequence

Current decision: blocked. Smithii did not provide a launch-to-volume scheduler contract, and Volume Bot is backend-keyed.

| Requirement | Smithii answer needed | Decision rule |
|---|---|---|
| Sequencing ownership | Whether Smithii owns delayed trigger, browser must stay open, or signed plan can schedule it. | Block if our backend would need to hold keys or submit delayed transactions. |
| Child-flow readiness | Bundle Launch and Volume Bot contracts complete. | Do not enable sequence before both child flows are live-eligible. |
| Failure boundaries | Launch succeeded but volume failed, launch failed before volume, user rejected second signature. | Audit and user copy must describe partial completion exactly. |

## Phase 8C Work Packages After Answers Arrive

Only create these implementation packages after the relevant answer rows are `answered`.

| Work package | Prerequisite answers | Scope |
|---|---|---|
| Live boundary update | Browser execution module, raw key requirements, supported flows. | Convert only answered flows from blocked/mock to live-eligible. |
| Browser handoff adapter | Browser module/API, auth/licensing, plan binding. | Client-side transaction assembly handoff with no backend key custody. |
| Server-issued plan/auth record | Auth/licensing and preview binding. | Backend-issued non-secret plan/auth fields for browser handoff. |
| Result and error mapping | Result contract and error contract. | Typed success/failure mapping, chat response, audit log updates. |
| Flow-specific validation | Fees, limits, caps, route/quantity mappings. | Preview validation aligned to Smithii enforcement. |
| Acceptance test runbook | Sandbox/mainnet test path. | First live test steps and pass/fail criteria. |

## Required Verification Before Any Live Flow Is Enabled

- `pnpm test`
- `pnpm lint`
- `pnpm build`
- `git diff --check`
- Private-key rejection tests for backend request paths.
- Preview-first and explicit-confirm tests for the target flow.
- Unsupported-flow tests proving incomplete flows remain mocked or blocked.
- Result/audit tests proving the app displays only Smithii-returned verifiable fields.
- Manual sandbox or approved low-amount mainnet runbook execution.

## Intake Process

1. Paste Smithii's answers into a new dated intake note or implementation plan.
2. Mark each answer row as `answered`, `partial`, `blocked`, or `needs meeting`.
3. Unlock only flows whose required gates are fully answered.
4. Create the smallest Phase 8C implementation package for the first unlocked flow.
5. Keep all other flows mocked or blocked.
6. Run one SMAC at the end of Phase 8C, then use cleanup-orchestrator only for confirmed findings.
