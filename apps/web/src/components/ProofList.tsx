"use client";

import { useState } from "react";
import type { Proof } from "@/lib/chain-data";
import { formatDateTime } from "@/lib/format";
import { proofUrl } from "@/lib/metadata";
import { verifyCid, type CidCheck } from "@/lib/verify-cid";

function VerifyButton({ cid }: { cid: string }) {
  const [state, setState] = useState<CidCheck | "pending" | null>(null);
  if (state === null) {
    return (
      <button
        type="button"
        className="text-xs text-brand underline-offset-2 hover:underline"
        onClick={async () => {
          setState("pending");
          setState(await verifyCid(cid));
        }}
      >
        Vérifier l&apos;empreinte
      </button>
    );
  }
  if (state === "pending") return <span className="text-xs text-ink-muted">Vérification…</span>;
  const text = {
    match: "✓ Le fichier correspond à l'empreinte enregistrée on-chain",
    mismatch: "✗ Le fichier servi NE correspond PAS à l'empreinte on-chain",
    unsupported: `○ ${"reason" in state ? state.reason : ""}`,
    error: `○ Vérification impossible (${"reason" in state ? state.reason : ""})`,
  }[state.status];
  const tone = state.status === "match" ? "text-success" : state.status === "mismatch" ? "text-danger" : "text-ink-muted";
  return (
    <span role="status" className={`text-xs ${tone}`}>
      {text}
    </span>
  );
}

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
            <VerifyButton cid={p.cid} />
          </li>
        ))}
      </ul>
    </div>
  );
}
