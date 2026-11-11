"use client";

import { RoleGate } from "@/components/pro/RoleGate";
import { SupplierMilestone } from "@/components/pro/SupplierPanels";
import { Notice } from "@/components/Notice";
import { useAllCampaignDetails } from "@/lib/hooks";

export default function SupplierPage() {
  const { data: details, isLoading, error } = useAllCampaignDetails();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Espace prestataire</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">
          Les jalons dont vous êtes le prestataire. Quand l&apos;organisation soumet une preuve, confirmez la livraison
          par une signature : sans elle, aucun paiement n&apos;est possible.
        </p>
      </header>

      <RoleGate role="supplier">
        {(account) => {
          const me = account.toLowerCase();
          const items =
            details?.flatMap((d) =>
              d.milestones
                .filter((m) => m.supplier.toLowerCase() === me && m.status !== "Draft" && m.status !== "Cancelled")
                .map((m) => ({ d, m })),
            ) ?? [];
          const todo = items.filter(({ m }) => m.status === "Submitted" && !m.supplierConfirmed);
          const others = items.filter((i) => !todo.includes(i));
          return (
            <div className="space-y-6">
              {error && <Notice tone="danger">Lecture impossible : {error.message}</Notice>}
              {isLoading && <p className="text-ink-muted">Chargement…</p>}
              {details && items.length === 0 && <p className="text-ink-muted">Aucun jalon ne vous concerne.</p>}
              {todo.length > 0 && (
                <section aria-labelledby="todo-title" className="space-y-3">
                  <h2 id="todo-title" className="font-semibold">
                    À confirmer ({todo.length})
                  </h2>
                  <ul className="space-y-3">
                    {todo.map(({ d, m }) => (
                      <SupplierMilestone key={`${d.summary.tracker}-${m.id}`} m={m} detail={d} account={account} />
                    ))}
                  </ul>
                </section>
              )}
              {others.length > 0 && (
                <section aria-labelledby="others-title" className="space-y-3">
                  <h2 id="others-title" className="font-semibold">
                    Suivi
                  </h2>
                  <ul className="space-y-3">
                    {others.map(({ d, m }) => (
                      <SupplierMilestone key={`${d.summary.tracker}-${m.id}`} m={m} detail={d} account={account} />
                    ))}
                  </ul>
                </section>
              )}
            </div>
          );
        }}
      </RoleGate>
    </div>
  );
}
