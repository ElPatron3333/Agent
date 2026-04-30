# Smithii Agent — Execution Plan

**Version:** 1.0  
**Date:** 2026-04-29  
**Status:** Approved scope, blocked on Smithii browser-side library + integration spec.

---

## 1. Executive Summary

Smithii Agent is a conversational AI execution layer over Smithii's Pump.fun infrastructure (Pro UI). The agent collects intent in chat, validates parameters, surfaces previews, gates execution behind explicit confirmation, and hands off to Smithii's existing browser-side tx-assembly module for signing and submission. **Zero key custody on our side.**

**MVP scope (Pump.fun only):**
1. Bundle Launch (Pro)
2. Bundle Swap (Pro — replaces legacy Bundle Sell, supports both buy and sell)
3. Volume Bot (Pro)

**Integration model:** Path A (partner) confirmed. Smithii will provide the browser-side tx-assembly module under a domain-locked + server-side-fee-enforced + signed-license arrangement. We own UX, parameter collection, conversational flow, and audit; Smithii owns tx execution.

**Critical rule:** agent capability = strict subset of what Smithii Pro UI does today. No client-side scheduling, no spend-cap behavioral rails, no behavioral nannying. If Smithii doesn't expose it, the agent doesn't do it.

---

## 2. Status & Blockers

### Locked
- All 3 tool contracts (schemas in §4)
- Wallet handling model: Option A (zero custody, file-based PK import/export mirrors Smithii Pro)
- Architecture: agent backend never receives privkeys; tx-assembly happens client-side via Smithii's library
- Stack picks (§10)

### Blocked on Smithii
- Browser-side tx-assembly module (or its equivalent) — needed to wire `execute_*` calls
- Confirmation of integration license terms (origin lock + server-side fee enforcement + license)
- 20-vs-25 wallet cap reconciliation for Bundle Swap (partner confirmed 20; UI shows 25 — Smithii to formalize)

### Not blocking — can build now
~70% of the build proceeds without any Smithii dependency. See §6 for what's library-blocked vs free-to-build.

---

## 3. Product Vision (Brief)

AI launch operator for Pump.fun deployers. Solo memecoin creators are the primary persona. The wedge: collapse 14 clicks across three Pro tabs into a sentence. "Launch with the same setup as last time but more aggressive Jito tip" should work.

**Out of MVP (deferred):** Buy holders, Buy markers, autonomous mode (no per-step confirms), strategy templates marketplace, Telegram/Discord interface, cross-token portfolio view.

---

## 4. Locked Tool Contracts

Shared types first, then per-tool.

### 4.1 Shared types

```typescript
type GlobalSettings = {
  speed: 'fast' | 'turbo',
  jito_tip: number | 'default',
  mev_protection: boolean,
  slippage_pct: number,           // default 10
  // organic_simulation_pct hidden from agent in MVP
};

type WalletRosterEntry = {
  pubkey: string,
  sol_balance: number,
  token_balance: number,
  pct_of_supply: number,
  tx_amount_sol?: number,
  tx_amount_token?: number,
};
// Roster lives in browser session. Agent backend never sees privkeys.
```

### 4.2 Bundle Launch

```typescript
prepare_bundle_launch({
  dex: 'pumpfun',
  token: {
    name: string,
    symbol: string,
    description: string,           // ≤250 chars
    image_file: File,              // .png/.jpg, 1000×1000 px
    socials_enabled: boolean,
    socials?: {
      website?: string,            // https://
      telegram?: string,           // https://t.me/
      twitter?: string,            // https://x.com/
    },
  },
  modifiers: {
    cashback_coin: boolean,            // PERMANENT — creator fees redirect to traders
    use_different_blocks: boolean,     // anti-wallet-linking; separate-block submission
    pregenerate_token_address: boolean,// +0.1 SOL — vanity/strategic mint
  },
  dev_wallet_pubkey: string,           // selected from shared roster
  bundle_wallets: Array<{              // 0..15 selected from roster (max 16 incl. dev)
    pubkey: string,
    buy_amount_sol: number,
  }>,
  global_settings: GlobalSettings,
}) → {
  plan_id: string,
  preview: {
    smithii_service_fee_sol: 0.10,
    pregenerate_fee_sol: 0.1 | 0,
    total_buys_sol: number,
    fees_from_dev_wallet_sol: number,  // 0.10 + maybe 0.1 + dev_buy
    per_wallet_min_balance: Array<{
      pubkey,
      buy_sol,
      recommended_balance_sol         // buy + ~0.05 buffer
    }>,
    summary_md: string,
  }
}

execute_bundle_launch({ plan_id })
  // → opens Phantom popup for dev-wallet signature; bundle wallets sign client-side via Smithii's lib
  → { mint_address, tx_signature }
```

### 4.3 Bundle Swap (replaces legacy Bundle Sell)

```typescript
prepare_bundle_swap({
  direction: 'sol_to_token' | 'token_to_sol' | 'token_to_token',
  from_token: 'SOL' | string /* mint */,
  to_token:   'SOL' | string,
  participating_wallets: string[],     // pubkeys from shared roster, max 20
  quantity_mode:
    | { type: 'total',        total_sol: number }
    | { type: 'fixed',        per_tx_sol: number }
    | { type: 'random',       min_sol: number, max_sol: number }
    | { type: 'random_pct',   min_pct: number, max_pct: number },
  tx_count: number,
  tx_delay_blocks: number,
  per_tx_overrides?: {                 // inline pencil-edit settings shown in UI
    slippage_pct?: number,
    gas?: number,
    priority?: number,
    mev_shield?: boolean,
  },
  global_settings: GlobalSettings,
}) → {
  plan_id: string,
  preview: {
    service_fee_sol: 0.10,             // paid by connected wallet
    estimated_interval_s: number,
    estimated_total_s: number,
    per_wallet: Array<{
      pubkey,
      sol_balance,                     // for fee-buffer check
      token_balance,
      planned_amount_sol_or_pct: number,
      status: 'ready' | 'skip_no_token' | 'skip_no_sol_for_fees',
    }>,
    routing: 'pumpfun_bonding' | 'pumpswap_amm', // agent routes by reading token state
    summary_md: string,
  }
}

execute_bundle_swap({ plan_id })
  // → connected wallet signs the 0.10 SOL fee tx; participating wallets self-sign in browser
  // → atomic: failure = nothing executed
  → { tx_signature, per_wallet_results: [{ pubkey, status, sol_received, error? }] }
```

### 4.4 Volume Bot

```typescript
prepare_volume_bot({
  volume_wallet_pubkey: string,        // funder, selected from roster
  token_address: string,
  makers: number,                       // default 100; Smithii-managed pool, NOT user wallets
  order_amount: { min_sol: number, max_sol: number },
  delay_seconds: { min: number, max: number },
  on_purchase: 'auto_sell' | 'return_to_wallet',
  sell_timing: 'after_each' | 'after_all',
  sell_mode: 'sell_strategy' | 'sell_100',
  sell_strategy?: {                    // required if sell_mode === 'sell_strategy'; one leg in MVP
    legs: Array<{
      sell_pct: { min: number, max: number },
      delay_seconds: { min: number, max: number },
    }>,
  },
  global_settings: GlobalSettings,
}) → {
  bot_id: string,
  preview: {
    smithii_service_fee_sol: number,   // 0.025 × (makers / 100)
    estimated_total_fees_sol: number,
    expected_duration_text: string,
    summary_md: string,
  }
}

execute_volume_bot({ bot_id })
  // → opens Phantom popup; connected wallet pays the entire estimated fee upfront
  → { run_id, status: 'started' }

pause_volume_bot({ run_id })  → { status: 'paused' }
resume_volume_bot({ run_id }) → { status: 'running' }   // if Smithii resume is supported; otherwise omit
get_volume_bot_status({ run_id }) → {
  state: 'running' | 'paused' | 'completed' | 'failed',
  makers_done: number,
  volume_done_sol: number,
  sol_consumed: number,
}
```

**End behavior:** SOL / time / wallets / volume are linked as one budget. The bot consumes them together. When SOL expires (or time elapses, whichever first), the bot completes and auto-stops. No separate refund step — by design, everything is balanced.

**Edit not currently supported.** If Smithii adds that endpoint, we'll add `edit_volume_bot()`.

---

## 5. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Browser (Next.js)                                           │
│  ┌──────────────┐  ┌────────────────┐  ┌─────────────────┐   │
│  │ Chat UI      │  │ Wallet Adapter │  │ Privkey Modals  │   │
│  │ (AI SDK)     │  │ (Phantom/Solfl)│  │ (CSV import)    │   │
│  └──────┬───────┘  └────────┬───────┘  └────────┬────────┘   │
│         │ stream            │ sign tx           │ → Smithii   │
│         │                   │                   │   library   │
└─────────┼───────────────────┼───────────────────┼─────────────┘
          │                   │                   │
          ▼                   ▼                   ▼
┌──────────────────────────────────────────────────────────────┐
│  Next.js Route Handlers (Vercel serverless)                  │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  Agent Loop (Vercel AI SDK + Claude Sonnet 4.6)      │    │
│  │  - tool definitions matching §4 schemas              │    │
│  │  - parameter collection state                         │    │
│  │  - confirmation gate before any execute_*             │    │
│  └────────────┬─────────────────────────────────────────┘    │
└───────────────┼──────────────────────────────────────────────┘
                │
        ┌───────┴────────────────┐
        │                        │
        ▼                        ▼
┌──────────────────┐    ┌────────────────────────┐
│ Supabase         │    │ Helius (Solana RPC)    │
│ - users          │    │ - token state reads    │
│ - sessions       │    │   (bonding vs PumpSwap)│
│ - tool_calls     │    │ - balance reads        │
│ - audit_log      │    │ - mint validation      │
│ - templates      │    └────────────────────────┘
└──────────────────┘

  ┌────────────────┐   ┌────────────────┐
  │ Sentry (errors)│   │ Axiom (logs)   │
  └────────────────┘   └────────────────┘
```

### Critical architectural rule
**Privkeys flow:** roster → browser-side privkey modal → Smithii's library (in browser) → Solana RPC. Never to our backend. Our backend sees: token addresses, wallet pubkeys, amounts, plan_ids, tx signatures returned from the library.

---

## 6. Phased Roadmap

Library-blocked phases marked **[LIB]**. Independent phases ship in parallel.

| Phase | Duration | Blocked by Smithii? | Outcome |
|---|---|---|---|
| **0. API/Library audit + license terms** | 1 wk | Discussion only | Smithii returns: library shape, integration license signed, sandbox endpoint if any. |
| **1. Project skeleton + DevOps** | 1 wk | No | Next.js + Supabase + Upstash + Sentry + CI green. Hello-world chat that calls a stub `executeBundleLaunch()` and returns mock data. |
| **2. Wallet roster + global settings UI** | 1 wk | No | Shared roster table, Import/Export PKs (browser-side), global settings panel. Mirrors Pro UI's bottom toolbar. |
| **3. Bundle Launch — agent + UI + stub** | 2 wks | No | End-to-end conversational flow: token metadata collection, modifier toggles, dev/bundle wallet selection from roster, preview card, confirm gate, stubbed `execute` returns fake mint address. |
| **4. Bundle Swap — agent + UI + stub** | 2 wks | No | Direction picker, quantity mode picker, TX count/delay collection, per-tx overrides, preview, stubbed execute. Includes Solana RPC token-state detection (bonding vs PumpSwap routing). |
| **5. Volume Bot — agent + UI + stub** | 1.5 wks | No | All Volume Bot params + Sell Strategy modal flow. Stubbed `execute_volume_bot` + `get_volume_bot_status` returning mock progress. |
| **6. Multi-step + templates** | 1 wk | No | "Launch then start volume bot" sequencing (one delay timer, no scheduler). Three named templates. Cross-session memory of last config. |
| **7. Audit log + safety hardening** | 1 wk | No | Every tool call + outcome to `audit_log`. Confirmation-gate enforcement. Plan TTL. Rate limiting. Pen-test on key handling. |
| **8. Smithii library wire-up** | 1.5 wks | **[LIB]** | Replace stubs in phases 3/4/5 with real `smithiiLib.execute*()` calls. End-to-end transactions on devnet/sandbox if Smithii provides one; otherwise carefully on mainnet with small amounts. |
| **9. Closed beta** | 2 wks | Yes (live calls) | 5–10 deployers from Smithii's user base. Bug bash. Iterate prompts. |
| **10. Production launch** | — | Yes | Open access. Monitoring + on-call. |

**Total before library lands:** ~9.5 weeks of independent build. Library wire-up + beta + launch ≈ 4.5 weeks more = ~14 weeks total from kickoff, assuming Smithii ships the library by week 8.

---

## 7. Engineering Breakdown

### Backend (Next.js route handlers)
- [BE-1] Supabase schema + migrations: users, sessions, conversations, messages, tool_calls, plans, audit_log, launch_templates.
- [BE-2] Agent endpoint `/api/chat` (streaming via AI SDK, persists every turn).
- [BE-3] `prepare_*` handlers for all 3 tools — pure validation + preview math; no tx work.
- [BE-4] `execute_*` handlers — return a signed handoff payload to the browser. Never accept privkeys.
- [BE-5] Plan record TTL (5 min) + idempotency keys.
- [BE-6] Audit log writer (every tool call regardless of outcome).
- [BE-7] Rate limiter (Upstash Ratelimit, 5 `execute_*`/min/user).
- [BE-8] Token-state lookup (RPC): is a mint on Pump.fun bonding curve, or migrated to PumpSwap?

### Frontend (Next.js + React)
- [FE-1] Chat shell with streaming, tool-call cards, preview cards, error states.
- [FE-2] Wallet adapter (Phantom + Solflare).
- [FE-3] Wallet roster table + roster operations (New / Migrate / Drain SOL / Delete / Import PKs / Export PKs). PK ops are browser-only.
- [FE-4] Privkey input modal (browser-only, posts directly to Smithii lib once available; today posts to a stub).
- [FE-5] Preview cards: BundleLaunchPreview, BundleSwapPreview, VolumeBotPreview (with Sell Strategy nested view).
- [FE-6] Global settings panel (Fast/Turbo, Jito Tip, MEV, Slippage).
- [FE-7] Audit log drawer (per-session, exportable as JSON).
- [FE-8] Empty states + first-launch onboarding flow.
- [FE-9] Volume Bot status snapshot UI (mock run state, pause button); polling waits for Smithii lifecycle endpoints.

### AI / Prompt Engineering
- [AI-1] System prompt v1 (rules: never invent tx signatures, mirror Smithii's tool surface only, confirm-before-execute).
- [AI-2] Tool schemas matching §4 contracts, descriptions tuned for Claude tool calling.
- [AI-3] Parameter-collection prompts (one missing field at a time, propose default, flag unusual).
- [AI-4] Confirmation parser (regex + LLM judge fallback for "confirm" / "launch" / "go" / "yes").
- [AI-5] Templates library (`stealth_v1`, `momentum_v1`, `slow_burn_v1`).
- [AI-6] Eval harness — 50 conversational scenarios with expected tool calls; runs in CI, blocks merge on regression.

### Blockchain / Wallet
- [BC-1] `@solana/wallet-adapter-react` integration.
- [BC-2] Pump.fun mint validation utility.
- [BC-3] Token state detection (bonding curve vs PumpSwap pool) via Helius.
- [BC-4] SOL + token balance reads with 60s cache.
- [BC-5] Session-bound nonce signing (user signs a nonce to authorize execute_* calls).

### DevOps / Infra
- [DO-1] Vercel project (web + serverless agent).
- [DO-2] Supabase project (prod + staging).
- [DO-3] Upstash Redis (BullMQ for the launch→volume sequencing delay + ratelimit).
- [DO-4] Sentry + Axiom wiring.
- [DO-5] Secrets in Vercel env; libsodium sealed boxes for any per-user secret (e.g., Smithii API key once issued).
- [DO-6] GitHub Actions: lint, typecheck, eval suite, preview deploy per PR.
- [DO-7] Helius API key + RPC failover (Triton or QuickNode as backup).

### QA / Testing
- [QA-1] Unit tests: plan TTL, idempotency, confirmation gate, parameter validation.
- [QA-2] Integration tests against Smithii sandbox (if provided) or mocked library.
- [QA-3] End-to-end Playwright: full chat flow → preview → confirm → mock execute.
- [QA-4] Eval suite: agent reliability under prompt changes.
- [QA-5] Pen-test on key handling before beta — confirm no privkey ever reaches our backend logs/network/storage.
- [QA-6] Load test: 100 concurrent chat sessions sustained.

---

## 8. Definition of Done — per phase

| Phase | DoD |
|---|---|
| 0 | Signed integration license + library shape doc + sandbox endpoint URL (or "no sandbox" confirmed). |
| 1 | `pnpm dev` runs locally, Vercel preview green, hello-world chat streams a response, tool stub returns a fake mint. |
| 2 | Wallet roster table works in browser, Import PKs reads a CSV in `privateKey` column, Export PKs downloads it. Global settings persist per session. |
| 3 | User can chat "launch a token called X with a 5-wallet bundle" and reach a preview card. Pressing Confirm calls a stubbed `execute` and the chat shows a mock mint address. Audit log records the call. |
| 4 | Same loop for Bundle Swap — including direction detection, quantity mode picker, and routing decision (bonding vs PumpSwap) shown in preview. |
| 5 | Same loop for Volume Bot — including one-leg Sell Strategy config, explicit volume-wallet selection, mock status snapshot, pause button. |
| 6 | "Launch then start volume after 5 min" works as one chained confirm, second step queued via BullMQ. Templates load from a TS file and apply correctly. |
| 7 | Plan TTL enforced (expired plan_id returns 410). Rate limiter enforced. Audit log queryable. Pen-test report shows zero privkey leaks. |
| 8 | Real `execute_*` calls succeed on Smithii sandbox (or 1 mainnet test launch with ≤0.5 SOL). 50/50 eval scenarios pass against live calls. |
| 9 | 5+ external testers complete full flows. Critical-bug count < 3 by end of week 2. Prompt eval ≥ 95% pass rate. |
| 10 | Public access. P95 latency < 3s on agent responses. Sentry error rate < 0.5%. |

---

## 9. Open Items with Smithii (integration handoff)

These don't block phases 1–7. They block phase 8.

1. Browser-side tx-assembly module (or equivalent) for all 3 tools.
2. Integration license: domain lock + server-side fee enforcement + signed terms.
3. Sandbox / devnet endpoint (yes/no).
4. Auth model — per-user Smithii API key, OAuth, or signed-tx?
5. Async pattern — webhook callbacks for Volume Bot lifecycle, or polling-only?
6. Status endpoint shape for Volume Bot (what fields are exposed in `get_status`).
7. Idempotency keys — does Smithii dedupe duplicate `execute` calls?
8. Failed-launch refund/recovery semantics (especially for the 0.10 SOL service fee).
9. Wallet cap reconciliation: 20 (per partner confirmation) vs 25 (UI textarea) for Bundle Swap. Lock the value Smithii enforces backend-side.
10. Edit-volume-bot endpoint — currently not supported per Smithii team. Would be an MVP+1 ask.

---

## 10. Stack & Infra

| Layer | Pick | Reason |
|---|---|---|
| Frontend | Next.js 15 (App Router) + React 19 + Tailwind + shadcn/ui | Single repo, fast iteration, server actions |
| Chat / streaming | Vercel AI SDK | Best tool calling + streaming UX, native React hooks |
| LLM | Claude Sonnet 4.6 primary, Haiku 4.5 for cheap classification | Strong tool calling, cost/latency balance |
| Backend | Next.js route handlers | No separate server in V1; promote later if needed |
| Workers | BullMQ + Upstash Redis | Schedule launch→volume sequencing delay + status polling |
| DB | Supabase (Postgres + Auth + RLS) | Auth + DB + row-level security in one |
| Wallet | `@solana/wallet-adapter-react` (Phantom + Solflare) | Standard Solana stack |
| RPC | Helius primary, Triton fallback | Reliable Pump.fun reads + tx confirms |
| Monitoring | Sentry + Axiom | Errors + structured logs without rolling our own |
| Hosting | Vercel (web) + Upstash (Redis) | Zero-ops for V1 |
| Secrets | Vercel env + libsodium sealed boxes for per-user secrets | KMS overkill for V1 |
| Lang | TypeScript end-to-end | One language, strong types around Smithii API |

---

## 11. Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| Smithii doesn't ship the library | **Critical** | Negotiate license terms early (phase 0). If they refuse, fall back to Option C (iframe their UI, agent only orchestrates). Worst-case delays launch by ~6 weeks. |
| Smithii backend rejects stripped-fee txs (server-side enforcement) — but we mis-build the fee tx | High | Co-design the fee instruction format with Smithii. Add an integration test that fails if our tx omits the fee. |
| Privkey leaks via accidental backend logging | **Critical** | Pen-test in phase 7 + lint rule that fails CI on any code path that reads privkey-shaped strings server-side. |
| Smithii Pro UI changes mid-build, schema drifts | Medium | Phase 0 schema review + semver-pinned tool contracts. Notify-on-change relationship with Smithii team. |
| Volume Bot status polling rate-limits us | Medium | Adaptive backoff. If Smithii has webhooks, prefer them. |
| User imports a wrong-shape CSV and breaks the modal | Low | Strict schema validation: header must be `privateKey`, base58 only. Show a sample on error. |
| Bonding-curve vs PumpSwap routing mistake (wrong tool variant) | High | Always read token state from Helius before confirm. Show the routing decision in the preview card. Allow user override. |
| LLM hallucinates a mint address or tx signature | High | System prompt rule + post-tool-call validator: any chat string matching mint/sig pattern must trace to a real tool response. |

---

## 12. What Ships Without Smithii (build-now list)

Concrete tasks the team can start tomorrow. None blocked by Smithii.

1. Project scaffolding at `D:\smithii-agent\` (Next.js init, ESLint, Prettier, TS config, Husky pre-commit).
2. Supabase schema + first migration.
3. Vercel project + preview deployments wired to GitHub.
4. Upstash Redis setup.
5. Sentry + Axiom wiring.
6. Wallet adapter integration (Phantom + Solflare login, session nonce signing).
7. Wallet roster table component + browser-only PK Import/Export.
8. Global settings panel.
9. Agent endpoint with Claude Sonnet 4.6, stub tool definitions returning mock responses.
10. Preview card components for all 3 tools.
11. Confirmation gate logic + plan TTL.
12. Audit log writer.
13. Rate limiter.
14. Token state detection (Helius RPC).
15. Eval harness with 10 starter scenarios.
16. README + dev setup docs.

That's a 4–5 week sprint of pure independent work. By the time Smithii ships their library, we have a fully working chat-driven agent that's missing only the final `execute_*` wire-up.

---

## 13. Build Rules

- Every script logs to a file (`_[name].log`). No silent failures.
- TypeScript-strict throughout; no bare `any`. Bash scripts use `set -euo pipefail`.
- Standard repo structure: README.md, LICENSE, .gitignore, package.json, tsconfig.json.
- Version number in `package.json`, bumped on every change.
- All user-facing copy in plain language (5th-grade reading level).
- Approval before any deploy that affects end users.
- No hardcoded paths. Project root is `D:\smithii-agent\`. All other paths derived.

---

## Appendix A — File layout (target)

```
D:\smithii-agent\
├── README.md
├── PLAN.md                  ← this doc
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
├── app\                     ← Next.js routes
│   ├── api\
│   │   ├── chat\route.ts
│   │   ├── prepare\
│   │   └── execute\
│   ├── (chat)\page.tsx
│   └── layout.tsx
├── components\
│   ├── chat\
│   ├── previews\
│   ├── wallet-roster\
│   └── settings\
├── lib\
│   ├── agent\               ← system prompt, tools, parameter collection
│   ├── solana\              ← RPC, mint validation, token state
│   ├── smithii\             ← stubs + future library wrapper
│   └── audit\
├── prompts\                 ← system prompts versioned in repo
├── templates\               ← stealth_v1, momentum_v1, slow_burn_v1
├── evals\                   ← scenario suite + CI runner
├── supabase\
│   └── migrations\
└── tests\
    ├── unit\
    ├── integration\
    └── e2e\
```

---

## Appendix B — Sample chat flows (for prompt design)

### B.1 Bundle Launch (cold start)
```
User: launch a Pump.fun token called PEPE2026
Agent: Got it. I need:
       - Symbol (suggest PEPE2026)
       - Description (≤250 chars)
       - Logo (.png/.jpg, 1000×1000, drag-drop or URL)
       - Dev wallet (pick from roster: 4 wallets available)
       - Bundle wallets (up to 15 more from roster)
       - SOL per wallet
       Modifiers: Cashback Coin (permanent), Use different blocks (anti-linking),
       Pregenerate Token Address (+0.1 SOL).
       What do you want to set, or shall I use defaults?
[user provides]
Agent: [shows preview card with total fees + per-wallet balance check]
       Type "launch" to execute.
[user: launch]
Agent: [calls Smithii lib, streams mint + tx sig back]
```

### B.2 Bundle Swap (sell scenario)
```
User: dump PEPE2026 from all my bundle wallets
Agent: Routing check: PEPE2026 is on Pump.fun bonding curve (not graduated).
       Using Pump.fun bundle sell variant.
       From: PEPE2026 → To: SOL
       Wallets: 6 selected from roster (your bundle from earlier launch)
       Quantity mode? (Total / Fixed / Random / Random %)
[user: random %, 80–100%]
Agent: [preview card with per-wallet est. SOL return]
       Tx count: 6, TX delay: 0 blocks (atomic).
       Type "confirm" to sell.
```

### B.3 Volume Bot
```
User: start a volume bot on PEPE2026 with sell strategy
Agent: Volume wallet (pick from roster):
       Makers: default 100, order amount range 0.01–0.02, delay 10–20s
       After purchase: Auto Sell or Return to Wallet?
       Sell Strategy leg (define % range + delay range):
[user defines one MVP leg]
Agent: [preview: service fee 0.025 SOL, total est. 1.525 SOL]
       Type "start" to launch.
```

---

## Appendix C — Glossary for Smithii team

When sharing this doc with Smithii, define these terms upfront:

- **Agent backend** — our Vercel route handlers. Never sees privkeys.
- **Smithii library** — the browser-side tx-assembly module we're requesting.
- **Roster** — the user's wallet list, browser-side only, file-importable as CSV with header `privateKey`.
- **Plan ID** — short-lived (5 min) reference issued by `prepare_*` and consumed by `execute_*`. Prevents replay.
- **Confirmation gate** — agent rule: no `execute_*` runs without a fresh plan_id and an explicit user confirm in the same turn.

---

**End of plan.**
