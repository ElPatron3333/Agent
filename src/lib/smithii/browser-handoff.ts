import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { PumpFunClient, type PumpFunClientArgs } from '@smithii/sdk/pump';
import { Connection } from '@solana/web3.js';

export type BrowserExecutableFlow = 'bundle_launch' | 'bundle_swap';

export type BrowserExecutionPlan = {
  planId: string;
  flow: BrowserExecutableFlow;
  wallet: string;
  paramsHash: string;
  expectedFeesLamports: string;
  expiresAt: string;
  nonce: string;
  idempotencyKey: string;
};

export type BrowserExecutionPlanInput = {
  flow: BrowserExecutableFlow;
  wallet: string;
  params: unknown;
  expectedFeesLamports: string;
  now?: Date;
  ttlMs?: number;
  nonce: string;
};

export type PumpBrowserHandoffConfig = {
  rpcUrl: string;
  proxyUrl: string;
  jitoUuid: string;
};

export type PumpBrowserHandoffEnv = {
  NEXT_PUBLIC_SOLANA_RPC_URL?: string;
  NEXT_PUBLIC_SMITHII_PROXY_URL?: string;
  NEXT_PUBLIC_SMITHII_JITO_UUID?: string;
};

const DEFAULT_PLAN_TTL_MS = 5 * 60 * 1000;
const PRIVATE_KEY_FIELD_NAMES = new Set([
  'pk',
  'privatekey',
  'privatekeys',
  'private_key',
  'privkeys',
  'secretkey',
  'seedphrase',
]);

export function createBrowserExecutionPlan({
  flow,
  wallet,
  params,
  expectedFeesLamports,
  now = new Date(),
  ttlMs = DEFAULT_PLAN_TTL_MS,
  nonce,
}: BrowserExecutionPlanInput): BrowserExecutionPlan {
  if (containsPrivateKeyField(params)) {
    throw new Error(
      'Browser execution plan params cannot contain private-key-shaped fields.',
    );
  }

  const expiresAt = new Date(now.getTime() + ttlMs).toISOString();
  const paramsHash = hashString(stableJson(params));
  const idempotencyKey = hashString(
    [wallet, flow, paramsHash, nonce, expiresAt].join(':'),
  );

  return {
    planId: `live_${flow}_${idempotencyKey.slice(0, 12)}`,
    flow,
    wallet,
    paramsHash,
    expectedFeesLamports,
    expiresAt,
    nonce,
    idempotencyKey,
  };
}

export function validatePumpBrowserHandoffConfig(
  config: PumpBrowserHandoffConfig,
): PumpBrowserHandoffConfig {
  if (config.rpcUrl.trim().length === 0) {
    throw new Error('Smithii browser handoff RPC URL is required.');
  }
  if (config.proxyUrl.trim().length === 0) {
    throw new Error('Smithii browser handoff proxy URL is required.');
  }
  if (config.jitoUuid.trim().length === 0) {
    throw new Error('Smithii browser handoff Jito UUID is required.');
  }

  return {
    rpcUrl: config.rpcUrl,
    proxyUrl: config.proxyUrl,
    jitoUuid: config.jitoUuid,
  };
}

export function pumpBrowserHandoffConfigFromEnv(
  env: PumpBrowserHandoffEnv,
): PumpBrowserHandoffConfig {
  return validatePumpBrowserHandoffConfig({
    rpcUrl: env.NEXT_PUBLIC_SOLANA_RPC_URL ?? '',
    proxyUrl: env.NEXT_PUBLIC_SMITHII_PROXY_URL ?? '',
    jitoUuid: env.NEXT_PUBLIC_SMITHII_JITO_UUID ?? '',
  });
}

export function createPumpBrowserClient(
  config: PumpBrowserHandoffConfig,
  signer: PumpFunClientArgs['signer'],
): PumpFunClient {
  const validConfig = validatePumpBrowserHandoffConfig(config);

  return new PumpFunClient({
    connection: new Connection(validConfig.rpcUrl, 'confirmed'),
    signer,
    jito: {
      uuid: validConfig.jitoUuid,
      proxyUrl: validConfig.proxyUrl,
    },
    proxyUrl: validConfig.proxyUrl,
  });
}

function hashString(value: string) {
  return bytesToHex(sha256(new TextEncoder().encode(value)));
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }
  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortJsonValue(value[key])]),
  );
}

function containsPrivateKeyField(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsPrivateKeyField);
  }
  if (!isRecord(value)) {
    return false;
  }

  return Object.entries(value).some(
    ([key, nestedValue]) =>
      PRIVATE_KEY_FIELD_NAMES.has(key.toLowerCase()) ||
      containsPrivateKeyField(nestedValue),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
