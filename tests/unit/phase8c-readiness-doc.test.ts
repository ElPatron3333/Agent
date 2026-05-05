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
});
