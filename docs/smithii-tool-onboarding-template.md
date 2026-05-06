# Smithii Tool Onboarding Template

Date started: YYYY-MM-DD
Status: template; copy before use
Owner: {name}
Related readiness matrix: `docs/future-smithii-tool-readiness-matrix.md`
Related intake pattern: `docs/phase8c-answer-intake-runbook.md`

## Purpose

Use this template before adding any new Smithii tool to the agent. Its job is to turn a candidate product into a clear build/no-build decision without guessing custody, runtime config, result contracts, or live-test behavior.

This document does not enable execution. A copied onboarding note can unlock implementation only after the exit checklist is complete and the candidate remains inside the zero-custody browser execution model.

## How To Use

1. Copy this file to `docs/smithii-tool-onboarding-{tool-slug}-{YYYY-MM-DD}.md`.
2. Fill only answers backed by Smithii docs, Smithii replies, local SDK code, or verified repo behavior.
3. Mark unknowns as `needs-answer`, not as inferred behavior.
4. Keep private keys, seed phrases, Jito UUIDs, burner wallet paths, launch images, and live artifacts out of this file.
5. Update `docs/future-smithii-tool-readiness-matrix.md` with the final status and blocker summary.

## Decision Values

| Decision | Meaning | Rule |
|---|---|---|
| `ready-for-spec` | Enough verified detail exists to write an implementation spec. | Allowed only when custody, runtime config, result/error contract, and acceptance path are answered. |
| `questions-needed` | Smithii or SDK details are missing. | Do not code live execution. Prepare a focused question packet. |
| `mock-only` | The tool is useful to show but not safe/available for execution. | Keep UI/API blocked or simulated with clear unsupported state. |
| `blocked-custody` | Known path sends private keys or custody material outside the browser/user wallet. | Do not implement unless Smithii provides a zero-custody alternative. |
| `deferred` | Tool is possible but outside current product priority. | Keep recorded, but do not spend implementation time. |

## 1. Tool Identity

| Field | Value | Source/evidence |
|---|---|---|
| Smithii product name |  |  |
| User-facing agent name |  |  |
| Chain/ecosystem | Solana / EVM / SUI / other |  |
| Launchpad/pool/protocol |  |  |
| SDK package and subpath import |  |  |
| Client/class/methods |  |  |
| Smithii Pro UI URL or docs link |  |  |
| Local skill or SDK source reviewed |  |  |
| Current matrix status |  |  |
| Proposed decision |  |  |

## 2. Product Scope

| Question | Answer | Status |
|---|---|---|
| What exact user job does this tool perform? |  | not reviewed |
| Is this a launch, swap, bot, post-launch ops, read-only, or cross-chain tool? |  | not reviewed |
| Which parts of Smithii Pro UI are in scope? |  | not reviewed |
| Which Pro UI options must stay hidden or blocked? |  | not reviewed |
| Does the tool overlap an existing repo flow? |  | not reviewed |
| What is the smallest useful version to build first? |  | not reviewed |

## 3. Custody And Signer Gate

A tool cannot leave planning until this section is explicit.

| Gate | Required answer | Status | Evidence | Code decision |
|---|---|---|---|---|
| Backend private-key exposure | Does our backend ever receive, proxy, store, log, or reflect private keys, seed phrases, private-key arrays, or private-key-shaped fields? | not reviewed |  |  |
| Smithii private-key exposure | Does Smithii receive raw keys, encrypted keys, delegated authority, or only signed transactions? | not reviewed |  |  |
| Browser-held secondary keys | If secondary wallets are used, where are the keys held and for how long? | not reviewed |  |  |
| Wallet adapter signer | Required signer shape: `publicKey`, `signTransaction`, `signAllTransactions`, or another interface. | not reviewed |  |  |
| Server-issued plan data | What non-secret fields can the backend issue before browser execution? | not reviewed |  |  |
| Storage/logging exclusions | Which fields must be redacted or rejected from API payloads, logs, audit records, and errors? | not reviewed |  |  |

Custody decision: `questions-needed`

Reason:

- {short explanation}

## 4. Runtime Config Gate

| Config value | Browser-public? | Secret? | Required for preview? | Required for execute? | Source | Missing-config behavior |
|---|---|---|---|---|---|---|
| Solana RPC / chain RPC |  |  |  |  |  |  |
| Smithii proxy/base URL |  |  |  |  |  |  |
| Jito UUID or bundle config |  |  |  |  |  |  |
| Bots API URL |  |  |  |  |  |  |
| Partner/license/session token |  |  |  |  |  |  |
| Other tool-specific config |  |  |  |  |  |  |

Runtime decision: `questions-needed`

## 5. Input Contract

| Input | Type/shape | Required? | Defaults | Smithii limit | Repo validation | Preview display | Unsupported handling |
|---|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  |  |

Metadata/upload flow:

| Item | Answer | Status | Code decision |
|---|---|---|---|
| Image/file requirements |  | not reviewed |  |
| Metadata upload owner: SDK, Smithii, caller CDN, or other |  | not reviewed |  |
| Returned metadata fields |  | not reviewed |  |
| Social/link validation |  | not reviewed |  |
| Failure/retry behavior |  | not reviewed |  |

## 6. Preview And Approval Contract

| Preview field | Source of truth | User-visible? | Audit-visible? | Notes |
|---|---|---|---|---|
| Fees |  | yes | yes |  |
| Spend amount |  | yes | yes |  |
| Wallet/mint/public identifiers |  | yes | yes | Public fields only. |
| Limits and warnings |  | yes | yes |  |
| Private-key-shaped values | none | no | no | Must be rejected/redacted. |

Approval requirements:

- Preview must be generated before execution.
- Execute must require explicit user confirmation.
- Confirmation must bind to the exact plan/preview or a server-issued non-secret plan record.
- Duplicate confirmation behavior must be defined before live submit is enabled.

Plan binding decision: `questions-needed`

## 7. Execution Contract

| Step | Browser or backend? | Method/API | Inputs | Outputs | Failure behavior |
|---|---|---|---|---|---|
| Initialize client |  |  |  |  |  |
| Upload or prepare metadata |  |  |  |  |  |
| Build/submit transaction or bundle |  |  |  |  |  |
| Record result/audit |  |  |  |  |  |

Execution constraints:

- Use SDK subpath imports only, never the root `@smithii/sdk` barrel.
- Browser execution code must not be reachable from server-only routes if it requires browser signer material.
- Backend validation must reject private-key-shaped request fields for live-enabled paths.
- Unsupported directions/options stay blocked before confirmation, not after failed execution.

## 8. Result And Error Contract

Success fields safe to display/audit:

| Field | Type | Source | Required? | Notes |
|---|---|---|---|---|
|  |  |  |  |  |

Error mapping:

| Smithii/raw state | Normalized category | Retryable? | User message rule | Audit fields |
|---|---|---|---|---|
| User rejects signature | `user_rejected` | yes | State that no confirmed transaction was submitted if true. | public fields only |
| Insufficient funds | `insufficient_funds` | yes | Show required public balance/spend info. | public fields only |
| Missing runtime config | `missing_config` | no | Tell operator which non-secret config is missing. | config key name only |
| Unknown error | `unknown` | maybe | Do not invent Smithii behavior. | sanitized message/category only |

Partial success semantics:

- Atomic all-or-nothing: yes/no/unknown
- Per-wallet result possible: yes/no/unknown
- Refund/recovery behavior: answered/needs-answer/not applicable

## 9. Acceptance Path

| Requirement | Answer | Status |
|---|---|---|
| Sandbox/devnet available? |  | not reviewed |
| If no sandbox, approved low-amount mainnet path? |  | not reviewed |
| Minimum safe spend |  | not reviewed |
| Required wallets/materials |  | not reviewed |
| Smithii monitoring/contact during test |  | not reviewed |
| Pass criteria |  | not reviewed |
| Fail/rollback/support path |  | not reviewed |

No flow can be called beta-ready until its acceptance path has passed.

## 10. Implementation Package Checklist

Create a separate implementation plan/spec after this onboarding note reaches `ready-for-spec`.

Required work items:

- Schema and validation updates for the new tool.
- Prompt/tool-routing updates that keep unsupported options blocked.
- Preview builder and plan binding updates.
- Browser-only Smithii SDK adapter or client wrapper.
- Result and error normalization.
- Audit-log field filtering for public/verifiable fields only.
- Unit tests for validation, private-key rejection, preview/confirm gating, disabled unsupported paths, result mapping, and error mapping.
- Acceptance runbook for the first low-risk live test.

Required verification before merge/live acceptance:

- `pnpm test`
- `pnpm exec tsc --noEmit`
- `pnpm lint`
- `git diff --check`
- One scoped SMAC for the phase.
- `cleanup-orchestrator` only for confirmed SMAC findings.

## 11. Focused Smithii Question Packet

Use this when the onboarding note ends at `questions-needed`. Keep it short and specific.

```markdown
We want to add {tool} to our Smithii Agent while preserving zero custody.

We need these exact details:

1. Package/subpath import, client constructor, method names, and supported browser/runtime for {tool}.
2. Whether any private keys, seed phrases, private-key arrays, or delegated custody material ever leave the user's browser/wallet. If yes, which flows must stay blocked for zero-custody integration?
3. Required runtime config values and which ones are browser-public.
4. Exact wallet adapter/signer interface required.
5. Exact input fields, defaults, caps, fees, and unsupported Pro UI options.
6. Metadata/image/upload flow, including who owns upload and returned fields.
7. Success result fields that are safe to show and audit.
8. Error states, retry rules, partial success behavior, and refund/recovery behavior.
9. Idempotency/replay expectations for duplicate confirmations.
10. Recommended sandbox/devnet or lowest-risk mainnet test procedure.
```

## 12. Exit Checklist

Before coding:

- Proposed decision is `ready-for-spec`; `questions-needed`, `mock-only`, `blocked-custody`, and `deferred` do not unlock implementation.
- Candidate row exists or is updated in `docs/future-smithii-tool-readiness-matrix.md`.
- Custody decision confirms zero-custody browser/user-wallet execution.
- Runtime config decision is answered and has no missing execute-time config.
- Result/error contract is answered enough for user messages and audit fields.
- Acceptance path is answered.
- Unsupported options are listed and blocked.

Before live/beta claim:

- Implementation verification passed.
- One scoped SMAC was run for the phase.
- Confirmed SMAC findings were fixed or explicitly accepted.
- Low-risk live acceptance runbook passed.
- Remaining unsupported tools/options are still blocked.

## Memory Guidance

Do not save this filled template to persistent memory. Keep it in the repo.

Memory can store only the reusable rule: every new Smithii tool must go through this onboarding template and the readiness matrix before implementation, and secrets/runtime artifacts never go to memory.
