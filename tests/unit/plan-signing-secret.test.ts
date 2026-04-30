import { describe, expect, it } from "vitest";

import { resolvePlanSigningSecret } from "../../src/lib/plan-signing-secret";

describe("plan signing secret", () => {
  it("uses an explicit configured signing secret", () => {
    expect(
      resolvePlanSigningSecret({
        configuredSecret: "configured-secret",
        nodeEnv: "production",
      }),
    ).toBe("configured-secret");
  });

  it("keeps local development keyless", () => {
    expect(
      resolvePlanSigningSecret({
        configuredSecret: undefined,
        nodeEnv: "development",
      }),
    ).toBe("smithii-agent-local-plan-signing-secret");
  });

  it("requires a configured signing secret in production", () => {
    expect(() =>
      resolvePlanSigningSecret({
        configuredSecret: undefined,
        nodeEnv: "production",
      }),
    ).toThrow("SMITHII_PLAN_SIGNING_SECRET is required in production.");
  });
});
