export type BrowserWalletEntry = {
  id: string;
  pubkey: string;
  privateKey: string;
  solBalance: number;
  tokenBalance: number;
  pctOfSupply: number;
  role: "dev" | "bundle";
};

export type PublicWalletRow = Omit<BrowserWalletEntry, "privateKey">;

export type LaunchWalletSelection = {
  devWalletPubkey: string;
  bundleWallets: Array<{
    pubkey: string;
    buyAmountSol: number;
  }>;
};

export type SwapWalletSelection = {
  participatingWallets: Array<{
    pubkey: string;
    solBalance: number;
    tokenBalance: number;
  }>;
};

export function createDemoWalletRoster(): BrowserWalletEntry[] {
  return [
    {
      id: "dev",
      pubkey: "DevWallet...91nP",
      privateKey: "4DemoPrivateKeyDev1111111111111111111111111111111",
      solBalance: 2.4,
      tokenBalance: 0,
      pctOfSupply: 0,
      role: "dev",
    },
    {
      id: "bundle-1",
      pubkey: "BndlWallet...4kd9",
      privateKey: "4DemoPrivateKeyBnde111111111111111111111111111111",
      solBalance: 1.2,
      tokenBalance: 1200,
      pctOfSupply: 1.3,
      role: "bundle",
    },
    {
      id: "bundle-2",
      pubkey: "BndlWallet...8qa2",
      privateKey: "4DemoPrivateKeyBnde222222222222222222222222222222",
      solBalance: 1.1,
      tokenBalance: 900,
      pctOfSupply: 0.9,
      role: "bundle",
    },
    {
      id: "bundle-3",
      pubkey: "BndlWallet...2mwp",
      privateKey: "4DemoPrivateKeyBnde333333333333333333333333333333",
      solBalance: 0.9,
      tokenBalance: 0,
      pctOfSupply: 0,
      role: "bundle",
    },
    {
      id: "bundle-4",
      pubkey: "BndlWallet...7xq1",
      privateKey: "4DemoPrivateKeyBnde444444444444444444444444444444",
      solBalance: 0.8,
      tokenBalance: 0,
      pctOfSupply: 0,
      role: "bundle",
    },
  ];
}

export function toPublicWalletRows(
  roster: BrowserWalletEntry[],
): PublicWalletRow[] {
  return roster.map((wallet) => ({
    id: wallet.id,
    pubkey: wallet.pubkey,
    solBalance: wallet.solBalance,
    tokenBalance: wallet.tokenBalance,
    pctOfSupply: wallet.pctOfSupply,
    role: wallet.role,
  }));
}

export function buildLaunchWalletSelection({
  roster,
  walletCount,
  solPerWallet,
}: {
  roster: BrowserWalletEntry[];
  walletCount: number;
  solPerWallet: number;
}): LaunchWalletSelection {
  const devWallet = roster.find((wallet) => wallet.role === "dev");
  if (!devWallet) {
    throw new Error("A dev wallet is required for Bundle Launch.");
  }

  const bundleWallets = roster
    .filter((wallet) => wallet.role === "bundle")
    .slice(0, walletCount);

  if (bundleWallets.length < walletCount) {
    throw new Error("Not enough bundle wallets are available.");
  }

  return {
    devWalletPubkey: devWallet.pubkey,
    bundleWallets: bundleWallets.map((wallet) => ({
      pubkey: wallet.pubkey,
      buyAmountSol: solPerWallet,
    })),
  };
}

export function buildSwapWalletSelection({
  roster,
  walletCount,
}: {
  roster: BrowserWalletEntry[];
  walletCount: number;
}): SwapWalletSelection {
  if (!Number.isInteger(walletCount) || walletCount < 1 || walletCount > 20) {
    throw new Error("Bundle Swap wallet count must be a whole number from 1 to 20.");
  }

  const participatingWallets = roster
    .filter((wallet) => wallet.role === "bundle")
    .slice(0, walletCount);

  if (participatingWallets.length < walletCount) {
    throw new Error("Not enough bundle wallets are available.");
  }

  return {
    participatingWallets: participatingWallets.map((wallet) => ({
      pubkey: wallet.pubkey,
      solBalance: wallet.solBalance,
      tokenBalance: wallet.tokenBalance,
    })),
  };
}

export function parsePrivateKeyCsv(csv: string): BrowserWalletEntry[] {
  const rows = csv
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter((row, index) => index === 0 || row.length > 0);

  const header = parseCsvRow(rows[0] ?? "");
  const privateKeyIndex = header.indexOf("privateKey");
  if (privateKeyIndex === -1) {
    throw new Error("CSV must have a single privateKey header.");
  }

  const privateKeys = rows
    .slice(1)
    .map((row) => parseCsvRow(row)[privateKeyIndex] ?? "");
  if (privateKeys.length === 0) {
    throw new Error("CSV must include at least one private key.");
  }

  return privateKeys.map((privateKey, index) => {
    const rowNumber = index + 2;
    if (!isBase58PrivateKeyShape(privateKey)) {
      throw new Error(`Private key on row ${rowNumber} must be base58.`);
    }

    return {
      id: `imported-${index + 1}`,
      pubkey: `Imported wallet ${index + 1}`,
      privateKey,
      solBalance: 0,
      tokenBalance: 0,
      pctOfSupply: 0,
      role: "bundle",
    };
  });
}

export function exportPrivateKeyCsv(roster: BrowserWalletEntry[]): string {
  return ["privateKey", ...roster.map((wallet) => wallet.privateKey)].join("\n");
}

function isBase58PrivateKeyShape(value: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,128}$/.test(value);
}

function parseCsvRow(row: string) {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < row.length; index += 1) {
    const char = row[index];
    const nextChar = row[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += char;
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  fields.push(current.trim());
  return fields;
}
