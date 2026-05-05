# Phase 8C Answer Intake Runbook

Date: 2026-05-05
Status: template ready; waiting for Smithii answers
Source questions: `docs/smithii-integration-questions.md`
Readiness matrix: `docs/phase8c-readiness-matrix.md`

## Purpose

Use this runbook when Smithii replies. Its job is to turn their answers into implementation decisions without guessing missing contract details.

This document is a template. Create a dated copy or a new dated intake note before pasting Smithii's actual answers.

## Intake Rules

- Do not mark a flow live-eligible unless zero custody is explicit for that flow.
- Do not infer missing API fields from the public SDK or from Smithii Pro UI behavior.
- Do not enable a flow because a similar flow is answered.
- If an answer says raw keys must leave the browser/user-controlled state, mark that flow `blocked`.
- If an answer is ambiguous, mark it `needs meeting`, not `answered`.
- If only one flow is complete, implement only that flow and keep the rest mocked or blocked.

## Answer Status Values

| Status | Meaning | Implementation impact |
|---|---|---|
| `answered` | Smithii gave enough exact contract detail to implement or intentionally block the item. | Can unlock dependent work if all other gates pass. |
| `partial` | Some details are useful but at least one required implementation detail is missing. | Keep dependent flow blocked. |
| `blocked` | Smithii confirmed the capability is unavailable, backend-keyed, not zero-custody, or out of scope. | Keep flow mocked/blocked and document the reason. |
| `needs meeting` | The answer is unclear or has tradeoffs that need a live decision. | Do not implement until resolved. |
| `not received` | No answer yet. | Keep dependent flow blocked. |

## Intake Header

Copy this section into each dated intake note.

```markdown
# Smithii Answer Intake - YYYY-MM-DD

Source: Smithii response from {person/channel/link}
Reviewed by: {name}
Repo commit reviewed against: {commit}
Decision summary: {one sentence}

## Overall Decision

- Bundle Launch: not received | answered | partial | blocked | needs meeting
- Bundle Swap SOL/token: not received | answered | partial | blocked | needs meeting
- Bundle Swap token-to-token: not received | answered | partial | blocked | needs meeting
- Volume Bot: not received | answered | partial | blocked | needs meeting
- Launch + Volume: not received | answered | partial | blocked | needs meeting

## Non-Negotiable Gate Result

- Zero custody confirmed for enabled flow(s): yes/no
- Backend private keys required anywhere: yes/no
- Preview first + explicit confirm preserved: yes/no
- Test path available: sandbox/devnet/mainnet-low-amount/none
- Flows safe to implement now: {list or none}
```

## Shared Contract Intake

| Question | Smithii answer | Status | Follow-up needed | Code decision |
|---|---|---|---|---|
| Browser module/API for zero-custody execution |  | not received |  |  |
| Raw private-key requirements or zero-custody limits |  | not received |  |  |
| Partner auth/licensing model |  | not received |  |  |
| Backend-issued fields before browser execution |  | not received |  |  |
| Idempotency key and retry/duplicate behavior |  | not received |  |  |
| Success/result fields per flow |  | not received |  |  |
| Error states and retryability |  | not received |  |  |

## Bundle Launch Intake

| Question | Smithii answer | Status | Follow-up needed | Code decision |
|---|---|---|---|---|
| Metadata upload flow before `createAndSnipeToken` |  | not received |  |  |
| Mint keypair generation and custody |  | not received |  |  |
| Buyer wallet signer model |  | not received |  |  |
| Limits and fees |  | not received |  |  |
| Success response |  | not received |  |  |
| Failed-launch funds and 0.10 SOL service-fee recovery |  | not received |  |  |

Unlock decision:

- `blocked`: default until every required row is `answered` or intentionally `blocked` with a safe mock-only decision.
- `live-eligible`: only if browser API, zero custody, auth, plan binding, idempotency, fees, result/error contracts, and test path are answered.

## Bundle Swap Intake

| Question | Smithii answer | Status | Follow-up needed | Code decision |
|---|---|---|---|---|
| Supported directions, including token-to-token |  | not received |  |  |
| Routing source of truth |  | not received |  |  |
| Quantity-mode mapping |  | not received |  |  |
| Per-transaction overrides |  | not received |  |  |
| Atomicity or partial results |  | not received |  |  |
| Wallet cap |  | not received |  |  |

Unlock decision:

- SOL/token directions may be evaluated separately from token-to-token.
- Token-to-token stays blocked unless Smithii explicitly supports a zero-custody path.
- Any unsupported quantity mode or override must be hidden or blocked before live confirm.

## Volume Bot Intake

| Question | Smithii answer | Status | Follow-up needed | Code decision |
|---|---|---|---|---|
| `AntiMEVClient.runSingle` product mapping |  | not received |  |  |
| Correct SDK version, endpoint, or browser module |  | not received |  |  |
| Field mapping for `onPurchase`, `sellTiming`, `sellMode`, `sellStrategy` |  | not received |  |  |
| `AntiMEVSingleConfig.randomize` semantics |  | not received |  |  |
| Zero-custody multi-wallet model |  | not received |  |  |
| Fees, payer, unused funds, refund/no-refund behavior |  | not received |  |  |
| Status lifecycle and exposed states |  | not received |  |  |
| Edit support |  | not received |  |  |

Unlock decision:

- Volume Bot stays blocked if the only available multi-wallet path is backend-keyed.
- Do not map `randomize` to amount, delay, or wallet behavior unless Smithii explicitly confirms it.
- Edit remains out of scope unless Smithii gives exact edit fields and signing rules.

## Launch + Volume Intake

| Question | Smithii answer | Status | Follow-up needed | Code decision |
|---|---|---|---|---|
| Sequencing without backend key custody |  | not received |  |  |
| Delayed trigger ownership |  | not received |  |  |
| Failure semantics across launch and volume |  | not received |  |  |

Unlock decision:

- Launch + Volume is not live-eligible until Bundle Launch, Volume Bot, and sequencing semantics are all answered.
- Block the sequence if our backend would need to hold keys or submit delayed transactions.

## Testing and Release Intake

| Question | Smithii answer | Status | Follow-up needed | Code decision |
|---|---|---|---|---|
| Sandbox/devnet endpoint |  | not received |  |  |
| Low-amount mainnet procedure if no sandbox |  | not received |  |  |
| Rate limits, retry headers, support contacts, monitoring |  | not received |  |  |

First live test decision:

- Test path: sandbox | devnet | low-amount mainnet | none
- Maximum spend approved: {amount}
- Smithii monitoring/contact present: yes/no
- Required wallets prepared: yes/no
- Rollback/recovery expectations documented: yes/no

## Flow Unlock Summary

| Flow | Decision | Why | First implementation package | Must remain blocked |
|---|---|---|---|---|
| Bundle Launch | blocked |  |  |  |
| Bundle Swap SOL/token | blocked |  |  |  |
| Bundle Swap token-to-token | blocked |  |  |  |
| Volume Bot | blocked |  |  |  |
| Launch + Volume | blocked |  |  |  |

Allowed decisions:

- `live-eligible`: all required gates answered and test path exists.
- `mock-only`: Smithii does not expose the capability or zero-custody path.
- `blocked-needs-answer`: missing contract detail.
- `blocked-needs-meeting`: answer is ambiguous.

## Phase 8C Implementation Package Template

Create the first implementation package only for the first `live-eligible` flow.

```markdown
# Phase 8C Implementation Package - {Flow}

Source intake: {dated intake doc}
Flow enabled: {flow}
Flows staying blocked: {list}

## Objective

Wire {flow} to Smithii browser handoff using only the answered zero-custody contract.

## Files likely in scope

- `src/lib/smithii/live-boundary.ts`
- `src/lib/smithii/sdk-adapter.ts` or new browser-only adapter if needed
- `src/app/api/chat/route.ts` only for non-secret plan/auth records
- `src/components/smithii-agent-app.tsx` for browser handoff UI/state
- relevant tests under `tests/unit/`

## Hard constraints

- Backend must not receive private keys, seed phrases, or private-key-shaped fields.
- Preview first, then explicit confirm.
- Unsupported flows remain mocked or blocked.
- Result UI and audit log use only Smithii-returned verifiable fields.

## Acceptance tests

- `pnpm test`
- `pnpm lint`
- `pnpm build`
- `git diff --check`
- Private-key rejection tests pass.
- Target flow preview-confirm test passes.
- Unsupported-flow tests pass.
- Sandbox or approved low-amount mainnet runbook passes.
```

## Post-Implementation Gate

After Phase 8C implementation:

1. Run the full verification suite.
2. Run exactly one Phase 8C SMAC for the completed phase.
3. Use cleanup-orchestrator only for confirmed SMAC findings.
4. Do not move to external testers until the live test path has passed and incomplete flows remain blocked.
