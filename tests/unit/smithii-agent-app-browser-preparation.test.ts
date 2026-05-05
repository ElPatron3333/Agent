import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = () => readFileSync("src/components/smithii-agent-app.tsx", "utf8");

describe("Smithii Agent App browser swap packet preparation wiring", () => {
  it("renders Bundle Swap packet preparation without importing the Pump executor", () => {
    const appSource = source();

    expect(appSource).toContain("model.preparation?.actionLabel");
    expect(appSource).toContain("prepareBundleSwapBrowserExecution");
    expect(appSource).toContain("bundleSwapBrowserExecutionSummary");
    expect(appSource).toContain("summary.planId");
    expect(appSource).toContain("summary.idempotencyKey");
    expect(appSource).toContain("summary.amountCount");
    expect(appSource).not.toContain("pump-browser-executor");
  });
});