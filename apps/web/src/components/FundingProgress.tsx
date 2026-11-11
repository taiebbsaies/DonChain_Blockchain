import { formatUsdc } from "@/lib/format";

type Props = { raised: bigint; softCap: bigint; hardCap: bigint; compact?: boolean };

/** Barre de progression vers le hardCap, avec un repère pour le softCap (objectif minimal). */
export function FundingProgress({ raised, softCap, hardCap, compact }: Props) {
  const pct = hardCap > 0n ? Number((raised * 10_000n) / hardCap) / 100 : 0;
  const softPct = hardCap > 0n ? Number((softCap * 10_000n) / hardCap) / 100 : 0;
  const reachedSoft = raised >= softCap;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold text-ink">{formatUsdc(raised)}</span>
        <span className="text-ink-muted">sur {formatUsdc(hardCap)}</span>
      </div>
      <div
        className="relative mt-2 h-2.5 overflow-hidden rounded-full bg-surface-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-label="Progression de la collecte"
      >
        <div
          className={`h-full rounded-full ${reachedSoft ? "bg-brand" : "bg-brand/60"}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
        <div
          className="absolute top-0 h-full w-0.5 bg-ink/70"
          style={{ left: `${Math.min(softPct, 100)}%` }}
          aria-hidden
        />
      </div>
      {!compact && (
        <p className="mt-1.5 text-xs text-ink-muted">
          Objectif minimal {formatUsdc(softCap)} {reachedSoft ? "atteint" : "non atteint"}
        </p>
      )}
    </div>
  );
}
