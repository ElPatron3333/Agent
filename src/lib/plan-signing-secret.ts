const LOCAL_PLAN_SIGNING_SECRET = "smithii-agent-local-plan-signing-secret";

export function resolvePlanSigningSecret({
  configuredSecret = process.env.SMITHII_PLAN_SIGNING_SECRET,
  nodeEnv = process.env.NODE_ENV,
}: {
  configuredSecret?: string;
  nodeEnv?: string;
} = {}) {
  if (configuredSecret?.trim()) {
    return configuredSecret;
  }

  if (nodeEnv === "production") {
    throw new Error("SMITHII_PLAN_SIGNING_SECRET is required in production.");
  }

  return LOCAL_PLAN_SIGNING_SECRET;
}
