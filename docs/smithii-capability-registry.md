# Smithii Capability Registry

Date: 2026-05-06
Status: non-executing metadata registry
Code: `src/lib/smithii/capability-registry.ts`
Readiness matrix: `docs/future-smithii-tool-readiness-matrix.md`
Onboarding template: `docs/smithii-tool-onboarding-template.md`

## Purpose

The Smithii capability registry gives the app and future implementation plans a typed, queryable list of known Smithii tools without enabling any new execution path.

The registry is intentionally descriptive. It does not import Smithii SDK clients, does not create browser/server executors, does not hold runtime config, and does not authorize live submit. Execution remains controlled by the existing flow-specific preview, explicit confirmation, browser handoff, and live-boundary code.

## Rules

- Every registry entry has `registryEffect: "metadata_only"`.
- Every registry entry has `executionEnabledByRegistry: false`.
- Pump Bundle Launch and Pump Bundle Swap are marked as existing Phase 8 browser handoff work awaiting live acceptance.
- Future tools remain planning-only, deferred, read-only, or blocked until their onboarding note answers custody, runtime config, result/error contract, and acceptance path.
- Backend-keyed flows remain blocked unless Smithii provides a zero-custody alternative.
- Runtime values, Jito UUIDs, private keys, burner wallet paths, launch images, and live-test artifacts stay out of the registry.

## Current Next Candidates

After Pump live acceptance passes, the registry marks these as the nearest candidates to evaluate:

1. PumpSwap graduated-token Bundle Swap
2. Bonk / LetsBonk Launch Bundle
3. Raydium LaunchLab Launch Bundle

Each still requires the onboarding template and a focused implementation spec before any code path is enabled.
