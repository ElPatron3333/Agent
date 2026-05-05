import type { PublicKey } from '@solana/web3.js';

import type {
  BrowserExecutableFlow,
  BrowserExecutionPlan,
} from './browser-handoff';

export type PumpBrowserExecutionErrorCategory =
  | 'config'
  | 'validation'
  | 'bundle_failed'
  | 'transaction_failed'
  | 'timeout'
  | 'network'
  | 'unknown';

export type NormalizedPumpBrowserExecutionError = {
  category: PumpBrowserExecutionErrorCategory;
  message: string;
  bundleId?: string;
  signature?: string;
};

export type PumpBrowserExecutorClient = {
  uploadMetadata(input: PumpBundleLaunchMetadataInput): Promise<unknown>;
  createAndSnipeToken(input: PumpCreateAndSnipeTokenInput): Promise<unknown>;
  bundleSellBuy(input: PumpBundleSellBuyInput): Promise<unknown>;
};

export type PumpBundleLaunchMetadataInput = {
  name: string;
  symbol: string;
  description: string;
  file: Blob | File;
  twitter?: string | null;
  telegram?: string | null;
  website?: string | null;
};

export type PumpBundleBuyerInput = {
  pk: string;
  amount: number;
};

export type PumpMintKeypairInput = {
  publicKey: {
    toBase58(): string;
  };
};

export type PumpCreateAndSnipeTokenInput = {
  mintKeypair: PumpMintKeypairInput;
  metadata: unknown;
  devAmount: number;
  buyers: PumpBundleBuyerInput[];
  isCashbackCoin: boolean;
  isTokenPregenerated: boolean;
};

export type PumpBundleLaunchBrowserHandoffInput = {
  plan: BrowserExecutionPlan;
  metadata: PumpBundleLaunchMetadataInput;
  mintKeypair: PumpMintKeypairInput;
  devAmount: number;
  buyers: PumpBundleBuyerInput[];
  isCashbackCoin: boolean;
  isTokenPregenerated: boolean;
  now?: Date;
};

export type PumpBundleLaunchBrowserHandoffResult = {
  flow: 'bundle_launch';
  planId: string;
  idempotencyKey: string;
  mint: string;
  createTxSignature?: string;
  buyerTxSignatures: string[];
  bundleIds: string[];
  paymentSignature?: string;
};

export type PumpBundleSwapDirection =
  | 'sol_to_token'
  | 'token_to_sol'
  | 'token_to_token';

export type PumpBundleSwapPool = 'pump' | 'pump-amm' | 'launchlab' | 'bonk';

export type PumpBundleSellBuyInput = {
  mint: PublicKey;
  action: 'buy' | 'sell';
  pool: PumpBundleSwapPool;
  privKeys: string[];
  amounts: number[];
};

export type PumpBundleSwapBrowserHandoffInput = {
  plan: BrowserExecutionPlan;
  mint: PublicKey;
  direction: PumpBundleSwapDirection;
  pool: PumpBundleSwapPool;
  privKeys: string[];
  amounts: number[];
  now?: Date;
};

export type PumpBundleSwapBrowserHandoffResult = {
  flow: 'bundle_swap';
  planId: string;
  idempotencyKey: string;
  action: 'buy' | 'sell';
  bundleIds: string[];
  txSignatures: string[];
  paymentSignature?: string;
};

export class PumpBrowserExecutionError extends Error {
  readonly category: PumpBrowserExecutionErrorCategory;
  readonly bundleId?: string;
  readonly signature?: string;

  constructor({
    category,
    message,
    bundleId,
    signature,
  }: NormalizedPumpBrowserExecutionError) {
    super(message);

    Object.defineProperty(this, 'name', {
      value: 'PumpBrowserExecutionError',
      configurable: true,
    });
    Object.defineProperty(this, 'message', {
      value: message,
      enumerable: true,
      configurable: true,
    });

    this.category = category;
    if (bundleId !== undefined) {
      this.bundleId = bundleId;
    }
    if (signature !== undefined) {
      this.signature = signature;
    }
  }
}

export function normalizePumpBrowserExecutionError(
  error: unknown,
): NormalizedPumpBrowserExecutionError {
  if (error instanceof PumpBrowserExecutionError) {
    return optionalErrorFields({
      category: error.category,
      message: error.message,
      bundleId: error.bundleId,
      signature: error.signature,
    });
  }

  const record = isRecord(error) ? error : undefined;
  const name = safeString(record?.name);
  const message =
    safeString(record?.message) ??
    (typeof error === 'string' ? error : 'Smithii browser execution failed.');

  return optionalErrorFields({
    category: categoryForErrorName(name),
    message,
    bundleId: safeString(record?.bundleId),
    signature: safeString(record?.signature),
  });
}

export function assertBrowserExecutionPlan(
  plan: BrowserExecutionPlan,
  expectedFlow: BrowserExecutableFlow,
  now = new Date(),
): BrowserExecutionPlan {
  if (plan.flow !== expectedFlow) {
    throw new PumpBrowserExecutionError({
      category: 'validation',
      message: `Browser execution plan flow mismatch: expected ${expectedFlow}.`,
    });
  }

  const expiresAtMs = Date.parse(plan.expiresAt);
  if (!Number.isFinite(expiresAtMs)) {
    throw new PumpBrowserExecutionError({
      category: 'validation',
      message: 'Browser execution plan expiry is invalid.',
    });
  }

  if (now.getTime() > expiresAtMs) {
    throw new PumpBrowserExecutionError({
      category: 'validation',
      message: 'Browser execution plan has expired.',
    });
  }

  return plan;
}

export async function executePumpBundleLaunchBrowserHandoff(
  client: PumpBrowserExecutorClient,
  input: PumpBundleLaunchBrowserHandoffInput,
): Promise<PumpBundleLaunchBrowserHandoffResult> {
  try {
    assertBrowserExecutionPlan(input.plan, 'bundle_launch', input.now);

    const metadata = await client.uploadMetadata(input.metadata);
    const result = await client.createAndSnipeToken({
      mintKeypair: input.mintKeypair,
      metadata,
      devAmount: input.devAmount,
      buyers: input.buyers,
      isCashbackCoin: input.isCashbackCoin,
      isTokenPregenerated: input.isTokenPregenerated,
    });
    const resultRecord = isRecord(result) ? result : {};

    return {
      flow: 'bundle_launch',
      planId: input.plan.planId,
      idempotencyKey: input.plan.idempotencyKey,
      mint: input.mintKeypair.publicKey.toBase58(),
      createTxSignature: safeString(resultRecord.createTxSignature),
      buyerTxSignatures: stringArray(resultRecord.buyerTxSignatures),
      bundleIds: stringArray(resultRecord.bundleIds),
      paymentSignature: safeString(resultRecord.paymentSignature),
    };
  } catch (error) {
    throw toPumpBrowserExecutionError(error);
  }
}

export async function executePumpBundleSwapBrowserHandoff(
  client: PumpBrowserExecutorClient,
  input: PumpBundleSwapBrowserHandoffInput,
): Promise<PumpBundleSwapBrowserHandoffResult> {
  try {
    assertBrowserExecutionPlan(input.plan, 'bundle_swap', input.now);
    validateBundleSwapInput(input);

    const action = swapAction(input.direction);
    const result = await client.bundleSellBuy({
      mint: input.mint,
      action,
      pool: input.pool,
      privKeys: input.privKeys,
      amounts: input.amounts,
    });
    const resultRecord = isRecord(result) ? result : {};

    return {
      flow: 'bundle_swap',
      planId: input.plan.planId,
      idempotencyKey: input.plan.idempotencyKey,
      action,
      bundleIds: stringArray(resultRecord.bundleIds),
      txSignatures: stringArray(resultRecord.txSignatures),
      paymentSignature: safeString(resultRecord.paymentSignature),
    };
  } catch (error) {
    throw toPumpBrowserExecutionError(error);
  }
}

function validateBundleSwapInput(input: PumpBundleSwapBrowserHandoffInput) {
  if (input.direction === 'token_to_token') {
    throw new PumpBrowserExecutionError({
      category: 'validation',
      message: 'Token-to-token bundle swaps are not supported by Pump browser execution.',
    });
  }

  if (input.privKeys.length === 0 || input.amounts.length === 0) {
    throw new PumpBrowserExecutionError({
      category: 'validation',
      message: 'Bundle swap private keys and amounts are required.',
    });
  }

  if (input.privKeys.length !== input.amounts.length) {
    throw new PumpBrowserExecutionError({
      category: 'validation',
      message: 'Bundle swap private keys and amounts must have matching lengths.',
    });
  }
}

function swapAction(direction: PumpBundleSwapDirection): 'buy' | 'sell' {
  if (direction === 'sol_to_token') {
    return 'buy';
  }
  if (direction === 'token_to_sol') {
    return 'sell';
  }

  throw new PumpBrowserExecutionError({
    category: 'validation',
    message: 'Unsupported bundle swap direction.',
  });
}

function toPumpBrowserExecutionError(error: unknown): PumpBrowserExecutionError {
  if (error instanceof PumpBrowserExecutionError) {
    return error;
  }

  return new PumpBrowserExecutionError(normalizePumpBrowserExecutionError(error));
}

function optionalErrorFields({
  category,
  message,
  bundleId,
  signature,
}: NormalizedPumpBrowserExecutionError): NormalizedPumpBrowserExecutionError {
  return {
    category,
    message,
    ...(bundleId !== undefined ? { bundleId } : {}),
    ...(signature !== undefined ? { signature } : {}),
  };
}

function categoryForErrorName(
  name: string | undefined,
): PumpBrowserExecutionErrorCategory {
  if (name === 'ValidationError') return 'validation';
  if (name === 'ConfigError') return 'config';
  if (name === 'BundleError') return 'bundle_failed';
  if (name === 'TransactionFailedError') return 'transaction_failed';
  if (name === 'TransactionTimeoutError') return 'timeout';
  if (name === 'HttpError' || name === 'RpcError') return 'network';
  return 'unknown';
}

function safeString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
