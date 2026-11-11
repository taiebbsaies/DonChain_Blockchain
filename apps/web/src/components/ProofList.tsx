import type { Proof } from "@/lib/chain-data";
import { formatDateTime } from "@/lib/format";
import { proofUrl } from "@/lib/metadata";

/** Historique des preuves d'un jalon : jamais écrasé, la dernière fait foi (§7.5). */
export function ProofList({ proofs }: { proofs: Proof[] }) {
  if (proofs.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-sm font-medium">Preuves ({proofs.length})</p>
      <ul className="space-y-1">
        {proofs.map((p, i) => (
          <li key={i} className="flex flex-wrap items-baseline gap-x-3">
            <a href={proofUrl(p.cid)} target="_blank" rel="noreferrer" className="link break-all font-mono text-xs">
              {p.cid}
            </a>
            <span className="text-xs text-ink-muted">
              {formatDateTime(p.timestamp)}
              {i < proofs.length - 1 && " · remplacée par une révision"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
