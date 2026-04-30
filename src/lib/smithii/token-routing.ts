import type { BundleSwapRouting } from "./types";

export function resolveMockBundleSwapRouting({
  fromToken,
  toToken,
}: {
  fromToken: string;
  toToken: string;
}): BundleSwapRouting {
  const inspectedToken = fromToken === "SOL" ? toToken : fromToken;
  return /(migrated|pumpswap|amm)/i.test(inspectedToken)
    ? "pumpswap_amm"
    : "pumpfun_bonding";
}
