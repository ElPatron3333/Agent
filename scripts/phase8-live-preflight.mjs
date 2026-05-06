import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const requiredEnv = [
  "NEXT_PUBLIC_SOLANA_RPC_URL",
  "NEXT_PUBLIC_SMITHII_PROXY_URL",
  "NEXT_PUBLIC_SMITHII_JITO_UUID",
  "SMITHII_PLAN_SIGNING_SECRET",
];

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    "wallet-csv": { type: "string" },
    "swap-mint": { type: "string" },
    "launch-image": { type: "string" },
  },
  allowPositionals: false,
});

const args = {
  walletCsv: values["wallet-csv"],
  swapMint: values["swap-mint"],
  launchImage: values["launch-image"],
};

const blockers = [];

for (const name of requiredEnv) {
  if (!process.env[name] || process.env[name].trim().length === 0) {
    blockers.push(`Missing env: ${name}`);
  }
}

if (!args.walletCsv) {
  blockers.push("Missing required argument: --wallet-csv <path>");
} else {
  const resolvedWalletCsv = path.resolve(args.walletCsv);
  if (!fs.existsSync(resolvedWalletCsv)) {
    blockers.push(`Wallet CSV not found: ${resolvedWalletCsv}`);
  } else {
    const firstLine = fs.readFileSync(resolvedWalletCsv, "utf8").split(/\r?\n/, 1)[0]?.trim();
    if (firstLine !== "privateKey") {
      blockers.push(`Wallet CSV must start with a single privateKey header: ${resolvedWalletCsv}`);
    }
  }
}

if (!args.swapMint) {
  blockers.push("Missing required argument: --swap-mint <pump-token-mint>");
}

if (!args.launchImage) {
  blockers.push("Missing required argument: --launch-image <path>");
} else {
  const resolvedLaunchImage = path.resolve(args.launchImage);
  if (!fs.existsSync(resolvedLaunchImage)) {
    blockers.push(`Launch image not found: ${resolvedLaunchImage}`);
  } else if (!/\.(png|jpg|jpeg)$/i.test(resolvedLaunchImage)) {
    blockers.push(`Launch image must end with .png, .jpg, or .jpeg: ${resolvedLaunchImage}`);
  }
}

console.log("Phase 8 live preflight");
console.log(`Repo: ${process.cwd()}`);
console.log("Runbook: docs/phase8-live-acceptance-runbook.md");

if (blockers.length > 0) {
  console.log("Status: BLOCKED");
  for (const blocker of blockers) {
    console.log(`- ${blocker}`);
  }
  process.exit(1);
}

console.log("Status: READY");
console.log("- Runtime config is set.");
console.log("- Burner wallet CSV exists with a privateKey header.");
console.log("- Swap mint argument is present.");
console.log("- Launch image path exists with a supported extension.");
console.log("Manual checks still required:");
console.log("- Phantom or Solflare is installed and unlocked.");
console.log("- Burner wallets have enough SOL for tiny test amounts plus fees.");
console.log("- You are using a low-risk Pump token mint you control or explicitly approve.");
