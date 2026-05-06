import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const scriptPath = join(repoRoot, "scripts", "phase8-live-preflight.mjs");
const validPrivateKey = "4Nd1mportedPrivateKey111111111111111111111111111";
const validMint = "So11111111111111111111111111111111111111112";
const validEnv = {
  NEXT_PUBLIC_SOLANA_RPC_URL: "https://rpc.example",
  NEXT_PUBLIC_SMITHII_PROXY_URL: "https://tools.smithii.io",
  NEXT_PUBLIC_SMITHII_JITO_UUID: "jito-test",
  SMITHII_PLAN_SIGNING_SECRET: "test-secret",
  NODE_NO_WARNINGS: "1",
};

describe("Phase 8 live preflight CLI", () => {
  it("reports missing required arguments", () => {
    const result = runPreflight([]);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Status: BLOCKED");
    expect(result.stdout).toContain("Missing required argument: --wallet-csv <path>");
    expect(result.stdout).toContain("Missing required argument: --swap-mint <pump-token-mint>");
    expect(result.stdout).toContain("Missing required argument: --launch-image <path>");
  });

  it("rejects the tracked placeholder sample CSV", () => {
    withTempDir((dir) => {
      const imagePath = writeLaunchImage(dir, "launch.png");
      const sampleCsv = join(repoRoot, "docs", "examples", "phase8-burner-wallets.sample.csv");

      const result = runPreflight([
        "--wallet-csv",
        sampleCsv,
        "--swap-mint",
        validMint,
        "--launch-image",
        imagePath,
      ]);

      expect(result.status).toBe(1);
      expect(result.stdout).toContain("Wallet CSV with private keys must be outside the repo");
      expect(result.stdout).toContain("Wallet CSV still contains placeholder values");
    });
  });

  it("rejects malformed private-key rows without echoing the value", () => {
    withTempDir((dir) => {
      const walletCsv = writeWalletCsv(dir, ["privateKey", "not-valid-000"].join("\n"));
      const imagePath = writeLaunchImage(dir, "launch.png");

      const result = runPreflight([
        "--wallet-csv",
        walletCsv,
        "--swap-mint",
        validMint,
        "--launch-image",
        imagePath,
      ]);

      expect(result.status).toBe(1);
      expect(result.stdout).toContain("Wallet CSV private key on row 2 must be base58-shaped");
      expect(result.stdout).not.toContain("not-valid-000");
    });
  });

  it("accepts a multi-column CSV with a valid privateKey column", () => {
    withTempDir((dir) => {
      const walletCsv = writeWalletCsv(
        dir,
        ["label,privateKey,notes", `first,${validPrivateKey},alpha`].join("\n"),
      );
      const imagePath = writeLaunchImage(dir, "launch.png");

      const result = runPreflight([
        "--wallet-csv",
        walletCsv,
        "--swap-mint",
        validMint,
        "--launch-image",
        imagePath,
      ]);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Status: READY");
    });
  });

  it("rejects an unignored repo-local wallet CSV", () => {
    const walletCsv = join(repoRoot, ".phase8-live-preflight-test-wallets.csv");
    withTempDir((dir) => {
      const imagePath = writeLaunchImage(dir, "launch.png");
      writeFileSync(walletCsv, ["privateKey", validPrivateKey].join("\n"));

      try {
        const result = runPreflight([
          "--wallet-csv",
          walletCsv,
          "--swap-mint",
          validMint,
          "--launch-image",
          imagePath,
        ]);

        expect(result.status).toBe(1);
        expect(result.stdout).toContain("Wallet CSV with private keys must be outside the repo");
      } finally {
        rmSync(walletCsv, { force: true });
      }
    });
  });

  it("allows a git-ignored repo-local wallet CSV", () => {
    const ignoredDir = join(repoRoot, ".smithii-local", `preflight-test-${Date.now()}`);
    mkdirSync(ignoredDir, { recursive: true });

    try {
      const walletCsv = writeWalletCsv(ignoredDir, ["privateKey", validPrivateKey].join("\n"));
      const imagePath = writeLaunchImage(ignoredDir, "launch.png");

      const result = runPreflight([
        "--wallet-csv",
        walletCsv,
        "--swap-mint",
        validMint,
        "--launch-image",
        imagePath,
      ]);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Status: READY");
    } finally {
      rmSync(ignoredDir, { recursive: true, force: true });
    }
  });

  it("rejects an invalid swap mint", () => {
    withTempDir((dir) => {
      const walletCsv = writeWalletCsv(dir, ["privateKey", validPrivateKey].join("\n"));
      const imagePath = writeLaunchImage(dir, "launch.png");

      const result = runPreflight([
        "--wallet-csv",
        walletCsv,
        "--swap-mint",
        "not-a-mint",
        "--launch-image",
        imagePath,
      ]);

      expect(result.status).toBe(1);
      expect(result.stdout).toContain("Swap mint is not a valid Solana public key");
    });
  });

  it("rejects unsupported launch image extensions", () => {
    withTempDir((dir) => {
      const walletCsv = writeWalletCsv(dir, ["privateKey", validPrivateKey].join("\n"));
      const imagePath = writeLaunchImage(dir, "launch.gif");

      const result = runPreflight([
        "--wallet-csv",
        walletCsv,
        "--swap-mint",
        validMint,
        "--launch-image",
        imagePath,
      ]);

      expect(result.status).toBe(1);
      expect(result.stdout).toContain("Launch image must end with .png, .jpg, or .jpeg");
    });
  });
});

function runPreflight(args: string[]) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      ...validEnv,
    },
  });
}

function withTempDir(callback: (dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), "smithii-preflight-test-"));
  try {
    callback(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function writeWalletCsv(dir: string, content: string) {
  const walletCsv = join(dir, "wallets.csv");
  writeFileSync(walletCsv, content);
  return walletCsv;
}

function writeLaunchImage(dir: string, filename: string) {
  const imagePath = join(dir, filename);
  writeFileSync(imagePath, "");
  return imagePath;
}
