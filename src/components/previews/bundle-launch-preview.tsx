import type { ActivePreview } from "@/lib/agent/mock-chat";

type BundleLaunchPreviewData = Extract<
  ActivePreview,
  { kind: "bundle_launch" }
>;

export function BundleLaunchPreview({
  preview,
}: {
  preview: BundleLaunchPreviewData;
}) {
  const socials = [
    preview.socials.website ? `Website: ${preview.socials.website}` : null,
    preview.socials.telegram ? `Telegram: ${preview.socials.telegram}` : null,
    preview.socials.twitter ? `Twitter/X: ${preview.socials.twitter}` : null,
  ].filter(Boolean);

  return (
    <div className="space-y-4">
      <div>
        <PreviewRow label="Token" value={preview.token} />
        <PreviewRow label="Image" value={preview.imageFileName} />
        <PreviewRow label="Dev wallet" value={preview.devWalletPubkey} />
        <PreviewRow
          label="Speed"
          value={settingSpeedLabel(preview.globalSettings.speed)}
        />
        <PreviewRow
          label="Jito tip"
          value={settingJitoLabel(preview.globalSettings.jitoTip)}
        />
        <PreviewRow
          label="MEV protection"
          value={preview.globalSettings.mevProtection ? "On" : "Off"}
        />
        <PreviewRow
          label="Slippage"
          value={`${preview.globalSettings.slippagePct}%`}
        />
        <PreviewRow
          label="Bundle buys"
          value={`${preview.totalBuysSol.toFixed(2)} SOL`}
        />
        <PreviewRow
          label="Service fee"
          value={`${preview.serviceFeeSol.toFixed(2)} SOL`}
        />
        <PreviewRow
          label="Dev wallet fees"
          value={`${preview.devWalletFeesSol.toFixed(2)} SOL`}
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <Pill
          label="Cashback"
          value={preview.modifiers.cashbackCoin ? "On" : "Off"}
        />
        <Pill
          label="Different blocks"
          value={preview.modifiers.useDifferentBlocks ? "On" : "Off"}
        />
        <Pill
          label="Pregenerate"
          value={preview.modifiers.pregenerateTokenAddress ? "On" : "Off"}
        />
      </div>

      <div className="rounded-md border border-cyan-950/80 p-3 text-sm text-slate-300">
        <p className="font-medium text-slate-100">Bundle wallets</p>
        <ul className="mt-2 space-y-1">
          {preview.bundleWallets.map((wallet) => (
            <li key={wallet.pubkey}>
              {wallet.pubkey}: {wallet.buyAmountSol.toFixed(2)} SOL
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-md border border-cyan-950/80 p-3 text-sm text-slate-300">
        <p className="font-medium text-slate-100">
          Socials {preview.socialsEnabled ? "enabled" : "disabled"}
        </p>
        {socials.length > 0 ? (
          <ul className="mt-2 space-y-1">
            {socials.map((social) => (
              <li key={social}>{social}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-2">No social links set.</p>
        )}
      </div>

      <p className="rounded-md border border-cyan-950/80 p-3 text-sm text-slate-300">
        {preview.summary}
      </p>
    </div>
  );
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-cyan-950/80 bg-[#091010] p-3">
      <p className="text-xs uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-cyan-100">{value}</p>
    </div>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-cyan-950/70 py-2 text-sm last:border-b-0">
      <span className="text-slate-500">{label}</span>
      <span className="overflow-hidden text-ellipsis text-right font-medium text-slate-100">
        {value}
      </span>
    </div>
  );
}

function settingSpeedLabel(speed: "fast" | "turbo") {
  return speed === "turbo" ? "Turbo" : "Fast";
}

function settingJitoLabel(jitoTip: number | "default") {
  return jitoTip === "default" ? "Default" : `${jitoTip} SOL`;
}
