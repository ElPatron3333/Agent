export type SmithiiCapabilityStatus =
  | "implemented-awaiting-live-acceptance"
  | "near-reuse-after-pump-live"
  | "contract-known-needs-spec"
  | "needs-smithii-answer"
  | "blocked-custody"
  | "defer-non-mvp"
  | "read-only-support";

export type SmithiiCurrentAgentSupport =
  | "phase8-browser-handoff-awaiting-live-acceptance"
  | "planning-only"
  | "blocked"
  | "deferred"
  | "read-only-planning";

export type SmithiiZeroCustodyStatus =
  | "confirmed-browser-held"
  | "likely-browser-held-needs-spec"
  | "signer-only-needs-review"
  | "blocked-backend-keyed"
  | "unknown"
  | "not-applicable-read-only";

export type SmithiiCapabilityId =
  | "pump_bundle_launch"
  | "pump_bundle_swap"
  | "pumpswap_graduated_bundle_swap"
  | "bonk_launch_bundle"
  | "launchlab_launch_bundle"
  | "moonit_launch_bundle"
  | "moonit_bundle_swap"
  | "bags_launchpad"
  | "maker_taker_bot"
  | "market_maker_deposit"
  | "classic_volume_bot"
  | "anti_mev_single_wallet"
  | "anti_mev_multi_wallet"
  | "mantis_launchpad"
  | "token_creator"
  | "token_manager"
  | "multisender_airdrop"
  | "token_vesting"
  | "token_claim"
  | "payment_lookup"
  | "evm_token_tools"
  | "sui_token_tools";

export type SmithiiCapability = {
  id: SmithiiCapabilityId;
  label: string;
  category:
    | "launch"
    | "swap"
    | "bot"
    | "post_launch_ops"
    | "read_only"
    | "cross_chain";
  chain: "solana" | "evm" | "sui" | "unknown";
  status: SmithiiCapabilityStatus;
  currentAgentSupport: SmithiiCurrentAgentSupport;
  zeroCustody: SmithiiZeroCustodyStatus;
  sdk: {
    packageName: "@smithii/sdk" | "unknown";
    subpath: string | null;
    client: string | null;
    methods: string[];
  };
  registryEffect: "metadata_only";
  executionEnabledByRegistry: false;
  requiresOnboardingTemplate: boolean;
  blockers: string[];
  reusableInfra: string[];
  nextCandidateOrder?: number;
};

const PUMP_BROWSER_REUSE = [
  "browser wallet signer adapter",
  "preview-first chat flow",
  "explicit live submit approval",
  "result/error normalization",
  "low-amount live runbook pattern",
];

const GENERIC_REUSE = [
  "preview-first chat flow",
  "explicit live submit approval",
  "result/error normalization",
];

export const SMITHII_CAPABILITY_REGISTRY = {
  pump_bundle_launch: capability({
    id: "pump_bundle_launch",
    label: "Pump Bundle Launch",
    category: "launch",
    chain: "solana",
    status: "implemented-awaiting-live-acceptance",
    currentAgentSupport: "phase8-browser-handoff-awaiting-live-acceptance",
    zeroCustody: "confirmed-browser-held",
    sdk: sdk("@smithii/sdk/pump", "PumpFunClient", ["createAndSnipeToken"]),
    requiresOnboardingTemplate: false,
    blockers: ["Awaiting low-amount mainnet live acceptance."],
    reusableInfra: PUMP_BROWSER_REUSE,
  }),
  pump_bundle_swap: capability({
    id: "pump_bundle_swap",
    label: "Pump Bundle Swap",
    category: "swap",
    chain: "solana",
    status: "implemented-awaiting-live-acceptance",
    currentAgentSupport: "phase8-browser-handoff-awaiting-live-acceptance",
    zeroCustody: "confirmed-browser-held",
    sdk: sdk("@smithii/sdk/pump", "PumpFunClient", ["bundleSellBuy"]),
    requiresOnboardingTemplate: false,
    blockers: ["Awaiting low-amount mainnet live acceptance."],
    reusableInfra: PUMP_BROWSER_REUSE,
  }),
  pumpswap_graduated_bundle_swap: capability({
    id: "pumpswap_graduated_bundle_swap",
    label: "PumpSwap Graduated Token Bundle Swap",
    category: "swap",
    chain: "solana",
    status: "near-reuse-after-pump-live",
    currentAgentSupport: "planning-only",
    zeroCustody: "likely-browser-held-needs-spec",
    sdk: sdk("@smithii/sdk/pumpswap", "PumpSwapClient", ["bundleSellBuy"]),
    requiresOnboardingTemplate: true,
    blockers: ["Needs pool eligibility and result parity spec after Pump live acceptance."],
    reusableInfra: PUMP_BROWSER_REUSE,
    nextCandidateOrder: 1,
  }),
  bonk_launch_bundle: capability({
    id: "bonk_launch_bundle",
    label: "Bonk / LetsBonk Launch Bundle",
    category: "launch",
    chain: "solana",
    status: "near-reuse-after-pump-live",
    currentAgentSupport: "planning-only",
    zeroCustody: "likely-browser-held-needs-spec",
    sdk: sdk("@smithii/sdk/launchpad", "BonkClient", ["createAndSnipe"]),
    requiresOnboardingTemplate: true,
    blockers: ["Needs metadata URI ownership, fees, result fields, and low-amount procedure."],
    reusableInfra: PUMP_BROWSER_REUSE,
    nextCandidateOrder: 2,
  }),
  launchlab_launch_bundle: capability({
    id: "launchlab_launch_bundle",
    label: "Raydium LaunchLab Launch Bundle",
    category: "launch",
    chain: "solana",
    status: "near-reuse-after-pump-live",
    currentAgentSupport: "planning-only",
    zeroCustody: "likely-browser-held-needs-spec",
    sdk: sdk("@smithii/sdk/launchpad", "LaunchlabClient", ["createAndSnipe"]),
    requiresOnboardingTemplate: true,
    blockers: ["Needs metadata URI ownership, platform limits, result fields, and low-amount procedure."],
    reusableInfra: PUMP_BROWSER_REUSE,
    nextCandidateOrder: 3,
  }),
  moonit_launch_bundle: capability({
    id: "moonit_launch_bundle",
    label: "Moonit Launch Bundle",
    category: "launch",
    chain: "solana",
    status: "contract-known-needs-spec",
    currentAgentSupport: "planning-only",
    zeroCustody: "likely-browser-held-needs-spec",
    sdk: sdk("@smithii/sdk/moonit", "MoonitClient", ["createAndSnipe"]),
    requiresOnboardingTemplate: true,
    blockers: ["Needs Moonit-specific metadata, amount semantics, fees, and result/error contract."],
    reusableInfra: GENERIC_REUSE,
  }),
  moonit_bundle_swap: capability({
    id: "moonit_bundle_swap",
    label: "Moonit Bundle Swap",
    category: "swap",
    chain: "solana",
    status: "contract-known-needs-spec",
    currentAgentSupport: "planning-only",
    zeroCustody: "likely-browser-held-needs-spec",
    sdk: sdk("@smithii/sdk/moonit", "MoonitClient", ["bundleSwap"]),
    requiresOnboardingTemplate: true,
    blockers: ["Needs direction, wallet cap, amount semantics, and result/error contract."],
    reusableInfra: GENERIC_REUSE,
  }),
  bags_launchpad: capability({
    id: "bags_launchpad",
    label: "Bags Launchpad / Bags Bundles",
    category: "launch",
    chain: "unknown",
    status: "needs-smithii-answer",
    currentAgentSupport: "planning-only",
    zeroCustody: "unknown",
    sdk: unknownSdk(),
    requiresOnboardingTemplate: true,
    blockers: ["Smithii needs to provide the package, client, signer model, metadata flow, and result/error contract."],
    reusableInfra: GENERIC_REUSE,
  }),
  maker_taker_bot: capability({
    id: "maker_taker_bot",
    label: "Maker/Taker Bot",
    category: "bot",
    chain: "unknown",
    status: "needs-smithii-answer",
    currentAgentSupport: "planning-only",
    zeroCustody: "unknown",
    sdk: unknownSdk(),
    requiresOnboardingTemplate: true,
    blockers: ["Smithii needs to map the product name to a concrete SDK client or endpoint and custody model."],
    reusableInfra: GENERIC_REUSE,
  }),
  market_maker_deposit: capability({
    id: "market_maker_deposit",
    label: "Market Maker Deposit",
    category: "bot",
    chain: "solana",
    status: "contract-known-needs-spec",
    currentAgentSupport: "planning-only",
    zeroCustody: "signer-only-needs-review",
    sdk: sdk("@smithii/sdk/market-maker", "MarketMakerClient", ["deposit"]),
    requiresOnboardingTemplate: true,
    blockers: ["Needs vault custody, withdrawal, refund, status, and stop/edit semantics."],
    reusableInfra: GENERIC_REUSE,
  }),
  classic_volume_bot: capability({
    id: "classic_volume_bot",
    label: "Classic Volume Bot",
    category: "bot",
    chain: "solana",
    status: "blocked-custody",
    currentAgentSupport: "blocked",
    zeroCustody: "blocked-backend-keyed",
    sdk: {
      packageName: "unknown",
      subpath: null,
      client: "market_maker_bot_ HTTP endpoints",
      methods: [],
    },
    requiresOnboardingTemplate: true,
    blockers: ["Classic Volume Bot is backend-keyed and cannot satisfy the zero-custody requirement."],
    reusableInfra: ["blocked/mock state only"],
  }),
  anti_mev_single_wallet: capability({
    id: "anti_mev_single_wallet",
    label: "Anti-MEV Single Wallet",
    category: "bot",
    chain: "solana",
    status: "contract-known-needs-spec",
    currentAgentSupport: "planning-only",
    zeroCustody: "signer-only-needs-review",
    sdk: sdk("@smithii/sdk/anti-mev", "AntiMEVClient", ["runSingle"]),
    requiresOnboardingTemplate: true,
    blockers: ["Needs product fit, refund behavior, status lifecycle, and low-amount acceptance path."],
    reusableInfra: GENERIC_REUSE,
  }),
  anti_mev_multi_wallet: capability({
    id: "anti_mev_multi_wallet",
    label: "Anti-MEV Multi Wallet",
    category: "bot",
    chain: "solana",
    status: "blocked-custody",
    currentAgentSupport: "blocked",
    zeroCustody: "blocked-backend-keyed",
    sdk: sdk("@smithii/sdk/anti-mev", "AntiMEVClient", ["runMultiple"]),
    requiresOnboardingTemplate: true,
    blockers: ["Current known path submits wallet custody material to a backend."],
    reusableInfra: ["blocked/mock state only"],
  }),
  mantis_launchpad: capability({
    id: "mantis_launchpad",
    label: "Mantis Launchpad",
    category: "launch",
    chain: "solana",
    status: "contract-known-needs-spec",
    currentAgentSupport: "planning-only",
    zeroCustody: "signer-only-needs-review",
    sdk: sdk("@smithii/sdk/mantis", "MantisClient", []),
    requiresOnboardingTemplate: true,
    blockers: ["Needs launch lifecycle, payment methods, claims, withdraws, fees, and acceptance plan."],
    reusableInfra: GENERIC_REUSE,
  }),
  token_creator: capability({
    id: "token_creator",
    label: "Token Creator",
    category: "post_launch_ops",
    chain: "solana",
    status: "defer-non-mvp",
    currentAgentSupport: "deferred",
    zeroCustody: "signer-only-needs-review",
    sdk: sdk("@smithii/sdk/token-creator", "TokenCreatorClient", ["createToken"]),
    requiresOnboardingTemplate: true,
    blockers: ["Outside the launchpad/bundler expansion priority and needs backend/payment behavior review."],
    reusableInfra: GENERIC_REUSE,
  }),
  token_manager: capability({
    id: "token_manager",
    label: "Token Manager Post-Launch Ops",
    category: "post_launch_ops",
    chain: "solana",
    status: "defer-non-mvp",
    currentAgentSupport: "deferred",
    zeroCustody: "signer-only-needs-review",
    sdk: sdk("@smithii/sdk/token-manager", "TokenManagerClient", []),
    requiresOnboardingTemplate: true,
    blockers: ["Needs operation-by-operation authority checks and result contracts."],
    reusableInfra: GENERIC_REUSE,
  }),
  multisender_airdrop: capability({
    id: "multisender_airdrop",
    label: "Multisender / Airdrop",
    category: "post_launch_ops",
    chain: "solana",
    status: "defer-non-mvp",
    currentAgentSupport: "deferred",
    zeroCustody: "signer-only-needs-review",
    sdk: sdk("@smithii/sdk/multisender", "MultiSenderClient", []),
    requiresOnboardingTemplate: true,
    blockers: ["Needs backend storage behavior, failed-recipient contract, and scheduling custody semantics."],
    reusableInfra: ["CSV import patterns", ...GENERIC_REUSE],
  }),
  token_vesting: capability({
    id: "token_vesting",
    label: "Token Vesting",
    category: "post_launch_ops",
    chain: "solana",
    status: "defer-non-mvp",
    currentAgentSupport: "deferred",
    zeroCustody: "signer-only-needs-review",
    sdk: sdk("@smithii/sdk/token-vesting", "TokenVestingClient", []),
    requiresOnboardingTemplate: true,
    blockers: ["Needs vesting lifecycle and claim-state result contract."],
    reusableInfra: GENERIC_REUSE,
  }),
  token_claim: capability({
    id: "token_claim",
    label: "Token Claim",
    category: "post_launch_ops",
    chain: "solana",
    status: "defer-non-mvp",
    currentAgentSupport: "deferred",
    zeroCustody: "signer-only-needs-review",
    sdk: sdk("@smithii/sdk/token-claim", "TokenClaimClient", []),
    requiresOnboardingTemplate: true,
    blockers: ["Needs receiver validation and claim lifecycle contract."],
    reusableInfra: GENERIC_REUSE,
  }),
  payment_lookup: capability({
    id: "payment_lookup",
    label: "Payment / Plan Lookup",
    category: "read_only",
    chain: "solana",
    status: "read-only-support",
    currentAgentSupport: "read-only-planning",
    zeroCustody: "not-applicable-read-only",
    sdk: sdk("@smithii/sdk/payment", "PaymentClient", []),
    requiresOnboardingTemplate: true,
    blockers: ["Needs product decision on whether plan or referral display belongs in the agent."],
    reusableInfra: ["read-only helper UI"],
  }),
  evm_token_tools: capability({
    id: "evm_token_tools",
    label: "EVM Token Tools",
    category: "cross_chain",
    chain: "evm",
    status: "defer-non-mvp",
    currentAgentSupport: "deferred",
    zeroCustody: "signer-only-needs-review",
    sdk: sdk("@smithii/sdk/evm/*", null, ["token creator", "multisender", "snapshot"]),
    requiresOnboardingTemplate: true,
    blockers: ["Needs separate chain architecture, RPC/wallet client model, and testnet or low-amount acceptance path."],
    reusableInfra: ["preview/approval process only"],
  }),
  sui_token_tools: capability({
    id: "sui_token_tools",
    label: "SUI Token / Snapshot Tools",
    category: "cross_chain",
    chain: "sui",
    status: "defer-non-mvp",
    currentAgentSupport: "deferred",
    zeroCustody: "signer-only-needs-review",
    sdk: sdk("@smithii/sdk/sui/*", null, ["token creator", "snapshot"]),
    requiresOnboardingTemplate: true,
    blockers: ["Needs separate chain architecture, signer custody review, and low-risk acceptance path."],
    reusableInfra: ["preview/approval process only"],
  }),
} as const satisfies Record<SmithiiCapabilityId, SmithiiCapability>;

export function listSmithiiCapabilities(): SmithiiCapability[] {
  return Object.values(SMITHII_CAPABILITY_REGISTRY);
}

export function getSmithiiCapability(
  id: SmithiiCapabilityId,
): SmithiiCapability {
  return SMITHII_CAPABILITY_REGISTRY[id];
}

export function listSmithiiNextCapabilityCandidates(): SmithiiCapability[] {
  return listSmithiiCapabilities()
    .filter((capability) => capability.nextCandidateOrder !== undefined)
    .sort((left, right) => left.nextCandidateOrder! - right.nextCandidateOrder!);
}

function capability(
  input: Omit<
    SmithiiCapability,
    "registryEffect" | "executionEnabledByRegistry"
  >,
): SmithiiCapability {
  return {
    ...input,
    registryEffect: "metadata_only",
    executionEnabledByRegistry: false,
  };
}

function sdk(
  subpath: string,
  client: string | null,
  methods: string[],
): SmithiiCapability["sdk"] {
  return {
    packageName: "@smithii/sdk",
    subpath,
    client,
    methods,
  };
}

function unknownSdk(): SmithiiCapability["sdk"] {
  return {
    packageName: "unknown",
    subpath: null,
    client: null,
    methods: [],
  };
}
