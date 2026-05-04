type RateLimitState = {
  windowStart: number;
  count: number;
};

const EXECUTE_ATTEMPT_LIMIT = 5;
const EXECUTE_ATTEMPT_WINDOW_MS = 60 * 1000;

const executeAttemptState = new Map<string, RateLimitState>();

export function consumeExecuteAttempt({
  key,
  now = Date.now(),
}: {
  key: string;
  now?: number;
}) {
  pruneExecuteAttemptRateLimiter(now);

  const state = executeAttemptState.get(key);
  if (!state || now - state.windowStart >= EXECUTE_ATTEMPT_WINDOW_MS) {
    executeAttemptState.set(key, {
      windowStart: now,
      count: 1,
    });
    return { allowed: true };
  }

  if (state.count >= EXECUTE_ATTEMPT_LIMIT) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil(
          (EXECUTE_ATTEMPT_WINDOW_MS - (now - state.windowStart)) / 1000,
        ),
      ),
    };
  }

  state.count += 1;
  return { allowed: true };
}

export function pruneExecuteAttemptRateLimiter(now = Date.now()) {
  let pruned = 0;
  for (const [key, state] of executeAttemptState.entries()) {
    if (now - state.windowStart >= EXECUTE_ATTEMPT_WINDOW_MS) {
      executeAttemptState.delete(key);
      pruned += 1;
    }
  }
  return pruned;
}

export function resetExecuteAttemptRateLimiter() {
  executeAttemptState.clear();
}
