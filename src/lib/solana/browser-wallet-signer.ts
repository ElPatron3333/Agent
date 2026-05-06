export type BrowserWalletPublicKey = {
  toBase58(): string;
};

export type InjectedSolanaProvider = {
  publicKey?: BrowserWalletPublicKey | string | null;
  connect?: () => Promise<{ publicKey?: BrowserWalletPublicKey | string | null } | void>;
  signTransaction?: <T>(transaction: T) => Promise<T>;
  signAllTransactions?: <T>(transactions: T[]) => Promise<T[]>;
};

export type BrowserWalletSigner = {
  publicKey: BrowserWalletPublicKey;
  signTransaction: <T>(transaction: T) => Promise<T>;
  signAllTransactions: <T>(transactions: T[]) => Promise<T[]>;
};

export type BrowserWalletConnectionResult =
  | {
      status: "connected";
      walletLabel: string;
      signer: BrowserWalletSigner;
    }
  | {
      status: "blocked";
      reason: string;
    };

export type BrowserWalletWindowLike = {
  solana?: InjectedSolanaProvider | null;
  solflare?: InjectedSolanaProvider | null;
};

export function injectedSolanaProviderFromWindow(
  windowLike: BrowserWalletWindowLike,
): InjectedSolanaProvider | null {
  return windowLike.solana ?? windowLike.solflare ?? null;
}

export async function connectInjectedSolanaWallet(
  provider: InjectedSolanaProvider | null,
): Promise<BrowserWalletConnectionResult> {
  if (!provider) {
    return blocked("Browser wallet provider is required.");
  }

  let connectedPublicKey: BrowserWalletPublicKey | string | null | undefined;
  try {
    const connected = provider.connect ? await provider.connect() : undefined;
    connectedPublicKey = connected?.publicKey ?? provider.publicKey;
  } catch (error) {
    return blocked(
      `Browser wallet connection failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  const publicKey = normalizePublicKey(connectedPublicKey);
  if (!publicKey) {
    return blocked("Browser wallet public key is unavailable.");
  }
  if (!provider.signTransaction) {
    return blocked("Browser wallet signTransaction is required.");
  }
  if (!provider.signAllTransactions) {
    return blocked("Browser wallet signAllTransactions is required.");
  }

  return {
    status: "connected",
    walletLabel: publicKey.toBase58(),
    signer: {
      publicKey,
      signTransaction: (transaction) => provider.signTransaction!(transaction),
      signAllTransactions: (transactions) => provider.signAllTransactions!(transactions),
    },
  };
}

function normalizePublicKey(
  value: BrowserWalletPublicKey | string | null | undefined,
): BrowserWalletPublicKey | null {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    return { toBase58: () => value };
  }
  if (typeof value.toBase58 === "function") {
    return value;
  }

  return null;
}

function blocked(reason: string): BrowserWalletConnectionResult {
  return { status: "blocked", reason };
}
