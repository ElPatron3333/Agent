import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("Phase 8C readiness matrix", () => {
  it("preserves the contract-neutral gates required before live execution", () => {
    const doc = readFileSync(
      path.join(process.cwd(), "docs", "phase8c-readiness-matrix.md"),
      "utf8",
    );

    for (const requiredTerm of [
      "Zero custody",
      "private keys",
      "Preview binding",
      "Idempotency",
      "Result contract",
      "Error contract",
      "Fees and limits",
      "Test path",
      "mocked or blocked",
    ]) {
      expect(doc).toContain(requiredTerm);
    }
  });

  it("uses the same missing-answer status as the answer intake runbook", () => {
    const readinessMatrix = readFileSync(
      path.join(process.cwd(), "docs", "phase8c-readiness-matrix.md"),
      "utf8",
    );
    const answerRunbook = readFileSync(
      path.join(process.cwd(), "docs", "phase8c-answer-intake-runbook.md"),
      "utf8",
    );

    expect(readinessMatrix).toContain("not received");
    expect(answerRunbook).toContain("not received");
    expect(readinessMatrix).not.toContain("unanswered");
  });

  it("records Smithii's final answers as the Phase 8C-A implementation source", () => {
    const intake = readFileSync(
      path.join(process.cwd(), "docs", "phase8c-answer-intake-2026-05-06.md"),
      "utf8",
    );

    expect(intake).toContain("Bundle Launch: live-eligible");
    expect(intake).toContain("Bundle Swap SOL/token: live-eligible");
    expect(intake).toContain("Bundle Swap token-to-token: blocked");
    expect(intake).toContain("Volume Bot: blocked");
    expect(intake).toContain("Launch + Volume: blocked");
    expect(intake).toContain("Backend must not receive private keys");
  });
});
