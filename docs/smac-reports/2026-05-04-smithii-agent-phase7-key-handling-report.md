# Phase 7 Key-Handling Report

Scope: local Phase 7 safety hardening before live Smithii execution. No live Smithii API calls or real private keys were used.

## Result

No private-key leak was found in the current mock-first backend path.

## Evidence

- The agent backend is documented as zero-custody in `README.md`, `AGENTS.md`, and `PLAN.md`.
- `/api/chat` recursively rejects request bodies containing known private-key field names before draft, wallet, or pending-plan processing. The deny-list covers the UI `privateKey` spelling plus repo-known SDK aliases such as `pk`, `privKeys`, and `privateKeys`.
- Private-key rejection audit records are payload-free and record only the event, session, and outcome.
- `tests/unit/chat-route.test.ts` covers private-key rejection and asserts the injected private-key sentinel is not echoed in the response body.
- Wallet roster tests cover imported wallet labels so private-key substrings are not reused as public labels.
- Smithii SDK adapter tests document that backend-keyed SDK flows remain blocked when they require private keys to leave the browser.
- Audit records only include session ID, event, tool, plan ID, and outcome; rejected pending-plan audit records copy only safe `id` and known `tool` fields.

## Residual Risk

- This report is code/test evidence, not a live network pen-test. Browser network capture should be repeated before beta when Smithii's browser-side transaction library is wired in.
- The public `@smithii/sdk` currently exposes some flows that accept private keys in SDK argument objects. Those remain assessment-only until Smithii confirms a zero-custody browser integration path.
