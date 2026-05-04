import { describe, expect, it } from "vitest";

import {
  consumeExecuteAttempt,
  pruneExecuteAttemptRateLimiter,
  resetExecuteAttemptRateLimiter,
} from "../../src/lib/rate-limit";

describe("execute attempt rate limiter", () => {
  it("prunes expired session entries", () => {
    resetExecuteAttemptRateLimiter();

    consumeExecuteAttempt({ key: "expired-session", now: 0 });

    expect(pruneExecuteAttemptRateLimiter(60_000)).toBe(1);
    expect(consumeExecuteAttempt({ key: "expired-session", now: 60_000 })).toEqual({
      allowed: true,
    });
  });
});
