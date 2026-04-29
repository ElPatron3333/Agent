# Codex Notes

Read `PLAN.md` before changing behavior. Keep the stricter rule when files disagree.

## Scope

- MVP is Pump.fun only.
- Expose only Smithii Pro capabilities that exist today.
- Build with mocks until Smithii provides the browser-side transaction assembly library.
- Do not add autonomous execution. Every execute path needs a preview and explicit confirmation.

## Security

- Never send private keys to the backend.
- Never log private keys.
- Do not add private-key fields to server-side schemas.
- Browser-only import/export can exist as UI, but real signing belongs in the future Smithii browser library wrapper.

## Phase 1

- Local development must run without production API keys.
- Keep external services optional until the feature needs them.
- Prefer small typed modules over broad abstractions.
- Validate with `pnpm test`, `pnpm lint`, and `pnpm build`.

## Phase Audits

- At the end of each phase, remind the project owner to run a SMAC/code-audit pass before starting the next phase.
- Treat SMAC output as an audit backlog, not as automatic permission for broad refactors.
