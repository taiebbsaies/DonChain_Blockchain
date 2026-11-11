"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { isAddress, type Address } from "viem";
import { useWriteContract } from "wagmi";
import { campaignFactoryAbi, milestoneTrackerAbi } from "@donchain/shared";
import { activeMilestoneCount, type CampaignDetail, type Milestone } from "@/lib/chain-data";
import { TARGET_CHAIN_ID, deployment } from "@/lib/config";
import { formatDate, formatUsdc, parseUsdc } from "@/lib/format";
import { toDataUri } from "@/lib/metadata";
import { useTransaction } from "@/lib/hooks";
import { AddressText } from "@/components/AddressText";
import { CampaignStateBadge, MilestoneStatusBadge } from "@/components/Badges";
import { FundingProgress } from "@/components/FundingProgress";
import { Notice } from "@/components/Notice";
import { ProofList } from "@/components/ProofList";

const DAY = 86_400;

/** Fin de journée locale du jour choisi, en secondes Unix. */
function dateToSeconds(value: string): bigint | null {
  if (!value) return null;
  const ms = new Date(`${value}T23:59:59`).getTime();
  return Number.isNaN(ms) ? null : BigInt(Math.floor(ms / 1000));
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

const PRIVACY_HINT = "Public et définitif : aucune donnée personnelle (nom de bénéficiaire, téléphone, pièce d'identité).";

// ---------------------------------------------------------------------------
// Création de campagne
// ---------------------------------------------------------------------------

export function CreateCampaignForm() {
  const { writeContractAsync } = useWriteContract();
  const tx = useTransaction();
  const [form, setForm] = useState({
    name: "",
    description: "",
    softCap: "",
    hardCap: "",
    minDonation: "1",
    deadline: "",
    sequential: true,
  });
  const [problem, setProblem] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setProblem(null);
    const softCap = parseUsdc(form.softCap);
    const hardCap = parseUsdc(form.hardCap);
    const minDonation = parseUsdc(form.minDonation);
    const deadline = dateToSeconds(form.deadline);
    const now = BigInt(Math.floor(Date.now() / 1000));

    if (!form.name.trim()) return setProblem("Donnez un nom à la campagne.");
    if (!softCap || !hardCap || minDonation === null) return setProblem("Montants invalides.");
    if (softCap > hardCap) return setProblem("L'objectif minimal ne peut pas dépasser l'objectif maximal.");
    if (minDonation > softCap) return setProblem("Le don minimum ne peut pas dépasser l'objectif minimal.");
    if (!deadline || deadline <= now) return setProblem("La date de fin de collecte doit être dans le futur.");
    if (deadline > now + BigInt(365 * DAY)) return setProblem("La collecte ne peut pas durer plus d'un an.");
    if (!deployment) return;

    const factory = deployment.factory;
    const ok = await tx.run("create", () =>
      writeContractAsync({
        chainId: TARGET_CHAIN_ID,
        address: factory,
        abi: campaignFactoryAbi,
        functionName: "createCampaign",
        args: [
          {
            softCap,
            hardCap,
            minDonation,
            fundingDeadline: deadline,
            sequential: form.sequential,
            metadataURI: toDataUri({ name: form.name.trim(), description: form.description.trim() }),
          },
        ],
      }),
    );
    if (ok) setForm({ name: "", description: "", softCap: "", hardCap: "", minDonation: "1", deadline: "", sequential: true });
  }

  return (
    <form onSubmit={submit} className="card space-y-4" aria-labelledby="create-campaign-title">
      <h2 id="create-campaign-title" className="font-semibold">
        Nouvelle campagne
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="c-name" label="Nom" hint={PRIVACY_HINT}>
          <input id="c-name" className="input" value={form.name} onChange={set("name")} maxLength={120} />
        </Field>
        <Field id="c-deadline" label="Fin de collecte">
          <input id="c-deadline" type="date" className="input" value={form.deadline} onChange={set("deadline")} />
        </Field>
      </div>
      <Field id="c-desc" label="Description">
        <textarea id="c-desc" className="input min-h-20" value={form.description} onChange={set("description")} maxLength={1000} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="c-soft" label="Objectif minimal (USDC)" hint="Sous ce montant, les donateurs sont remboursés.">
          <input id="c-soft" className="input" inputMode="decimal" value={form.softCap} onChange={set("softCap")} />
        </Field>
        <Field id="c-hard" label="Objectif maximal (USDC)" hint="Les dons au-delà sont refusés.">
          <input id="c-hard" className="input" inputMode="decimal" value={form.hardCap} onChange={set("hardCap")} />
        </Field>
        <Field id="c-min" label="Don minimum (USDC)">
          <input id="c-min" className="input" inputMode="decimal" value={form.minDonation} onChange={set("minDonation")} />
        </Field>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={form.sequential}
          onChange={(e) => setForm((f) => ({ ...f, sequential: e.target.checked }))}
        />
        <span>
          Jalons séquentiels
          <span className="block text-xs text-ink-muted">Un seul jalon en cours à la fois (recommandé).</span>
        </span>
      </label>

      {problem && <Notice tone="danger">{problem}</Notice>}
      {tx.error && <Notice tone="danger">{tx.error}</Notice>}
      <button type="submit" className="btn-primary" disabled={!!tx.pending}>
        {tx.pending ? "Création…" : "Créer la campagne"}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Jalons
// ---------------------------------------------------------------------------

function CreateMilestoneForm({ detail }: { detail: CampaignDetail }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>
        + Ajouter un jalon
      </button>
    );
  }
  return <MilestoneFormBody detail={detail} onDone={() => setOpen(false)} />;
}

function MilestoneFormBody({ detail, onDone }: { detail: CampaignDetail; onDone: () => void }) {
  const { writeContractAsync } = useWriteContract();
  const tx = useTransaction();
  const [form, setForm] = useState({ supplier: "", amount: "", deadline: "", title: "", quote: "" });
  const [problem, setProblem] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));
  const prefix = `m-${detail.summary.id}`;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setProblem(null);
    const amount = parseUsdc(form.amount);
    const deadline = dateToSeconds(form.deadline);
    if (!isAddress(form.supplier)) return setProblem("Adresse du prestataire invalide.");
    if (form.supplier.toLowerCase() === detail.summary.org.toLowerCase())
      return setProblem("Le prestataire doit être distinct de l'organisation.");
    if (!amount) return setProblem("Montant invalide.");
    if (!deadline || deadline <= detail.chainNow) return setProblem("La date limite doit être dans le futur.");
    if (!form.title.trim()) return setProblem("Décrivez le jalon.");

    const ok = await tx.run("create-milestone", () =>
      writeContractAsync({
        chainId: TARGET_CHAIN_ID,
        address: detail.summary.tracker,
        abi: milestoneTrackerAbi,
        functionName: "createMilestone",
        args: [
          form.supplier as Address,
          amount,
          deadline,
          toDataUri({ title: form.title.trim(), quote: form.quote.trim() }),
        ],
      }),
    );
    if (ok) onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-dashed border-line p-4">
      <p className="text-sm font-medium">Nouveau jalon</p>
      <Notice tone="warning">
        Le prestataire, le montant, la date limite et la description seront figés définitivement. Pour corriger, il
        faudra annuler le jalon et en créer un autre.
      </Notice>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={`${prefix}-title`} label="Intitulé" hint={PRIVACY_HINT}>
          <input id={`${prefix}-title`} className="input" value={form.title} onChange={set("title")} maxLength={160} />
        </Field>
        <Field id={`${prefix}-quote`} label="Référence du devis (facultatif)">
          <input id={`${prefix}-quote`} className="input" value={form.quote} onChange={set("quote")} maxLength={160} />
        </Field>
        <Field id={`${prefix}-supplier`} label="Adresse du prestataire" hint="Doit être attestée (KYC).">
          <input
            id={`${prefix}-supplier`}
            className="input font-mono text-sm"
            placeholder="0x…"
            value={form.supplier}
            onChange={set("supplier")}
            autoComplete="off"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id={`${prefix}-amount`} label="Montant (USDC)">
            <input id={`${prefix}-amount`} className="input" inputMode="decimal" value={form.amount} onChange={set("amount")} />
          </Field>
          <Field id={`${prefix}-deadline`} label="Date limite">
            <input id={`${prefix}-deadline`} type="date" className="input" value={form.deadline} onChange={set("deadline")} />
          </Field>
        </div>
      </div>
      {problem && <Notice tone="danger">{problem}</Notice>}
      {tx.error && <Notice tone="danger">{tx.error}</Notice>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn-primary" disabled={!!tx.pending}>
          {tx.pending ? "Création…" : "Créer le jalon (brouillon)"}
        </button>
        <button type="button" className="btn-ghost" disabled={!!tx.pending} onClick={onDone}>
          Fermer
        </button>
      </div>
    </form>
  );
}

function OrgMilestone({ m, detail }: { m: Milestone; detail: CampaignDetail }) {
  const { writeContractAsync } = useWriteContract();
  const tx = useTransaction();
  const [cid, setCid] = useState("");
  const tracker = detail.summary.tracker;
  const available = detail.summary.totalRaised - detail.committed;
  const blockedBySequence = detail.sequential && activeMilestoneCount(detail) > 0;
  const lockBlocker =
    detail.summary.state !== "Active"
      ? null // message dédié ci-dessous
      : blockedBySequence
        ? "Campagne séquentielle : terminez le jalon en cours avant d'en verrouiller un autre."
        : m.amount > available
          ? `Montant supérieur aux fonds non engagés (${formatUsdc(available)}).`
          : null;

  const call = (label: string, functionName: "lockMilestone" | "cancel") =>
    tx.run(label, () =>
      writeContractAsync({
        chainId: TARGET_CHAIN_ID,
        address: tracker,
        abi: milestoneTrackerAbi,
        functionName,
        args: [m.id],
      }),
    );

  async function submitProof(e: FormEvent) {
    e.preventDefault();
    const value = cid.trim();
    if (!value) return;
    const ok = await tx.run("proof", () =>
      writeContractAsync({
        chainId: TARGET_CHAIN_ID,
        address: tracker,
        abi: milestoneTrackerAbi,
        functionName: "submitProof",
        args: [m.id, value],
      }),
    );
    if (ok) setCid("");
  }

  return (
    <li className="space-y-3 rounded-lg border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs text-ink-muted">Jalon {Number(m.id) + 1}</p>
          <p className="font-medium">{m.metadata?.title ?? "Sans intitulé"}</p>
          <p className="text-sm text-ink-muted">
            {formatUsdc(m.amount)} · <AddressText address={m.supplier} /> · avant le {formatDate(m.deadline)}
          </p>
        </div>
        <MilestoneStatusBadge status={m.status} />
      </div>

      <ProofList proofs={m.proofs} />

      {m.status === "Submitted" && (
        <p className="text-sm text-ink-muted">
          {m.supplierConfirmed
            ? "Le prestataire a confirmé la livraison. En attente de l'auditeur."
            : "En attente de la confirmation signée du prestataire."}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {m.status === "Draft" && (
          <>
            <button
              type="button"
              className="btn-primary"
              disabled={!!tx.pending || detail.summary.state !== "Active" || !!lockBlocker}
              onClick={() => call("lock", "lockMilestone")}
            >
              {tx.pending === "lock" ? "Verrouillage…" : "Verrouiller (réserver les fonds)"}
            </button>
            <button type="button" className="btn-secondary" disabled={!!tx.pending} onClick={() => call("cancel", "cancel")}>
              Annuler
            </button>
          </>
        )}
        {m.status === "Pending" && (
          <button type="button" className="btn-secondary" disabled={!!tx.pending} onClick={() => call("cancel", "cancel")}>
            {tx.pending === "cancel" ? "Annulation…" : "Annuler et libérer les fonds"}
          </button>
        )}
      </div>

      {m.status === "Draft" && detail.summary.state === "Funding" && (
        <p className="text-xs text-ink-muted">Le verrouillage sera possible quand la collecte sera terminée.</p>
      )}
      {m.status === "Draft" && lockBlocker && <p className="text-xs text-ink-muted">{lockBlocker}</p>}

      {(m.status === "Pending" || m.status === "Submitted") && (
        <form onSubmit={submitProof} className="flex flex-wrap items-end gap-2">
          <div className="min-w-60 flex-1">
            <label htmlFor={`proof-${tracker}-${m.id}`} className="mb-1.5 block text-sm font-medium">
              {m.status === "Pending" ? "Soumettre la preuve (CID IPFS)" : "Soumettre une révision"}
            </label>
            <input
              id={`proof-${tracker}-${m.id}`}
              className="input font-mono text-sm"
              placeholder="ipfs://bafy…"
              value={cid}
              onChange={(e) => setCid(e.target.value)}
              autoComplete="off"
            />
          </div>
          <button type="submit" className="btn-primary" disabled={!!tx.pending || !cid.trim()}>
            {tx.pending === "proof" ? "Envoi…" : "Soumettre"}
          </button>
          {m.status === "Submitted" && (
            <p className="w-full text-xs text-ink-muted">
              Une révision est ajoutée à l&apos;historique et oblige le prestataire à signer de nouveau.
            </p>
          )}
        </form>
      )}

      {tx.error && <Notice tone="danger">{tx.error}</Notice>}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Campagne de l'organisation
// ---------------------------------------------------------------------------

export function OrgCampaign({ detail }: { detail: CampaignDetail }) {
  const { writeContractAsync } = useWriteContract();
  const tx = useTransaction();
  const c = detail.summary;
  const active = activeMilestoneCount(detail);
  const canCreate = c.state === "Funding" || c.state === "Active";

  async function close() {
    if (!confirm("Clôturer la campagne ? Le reliquat non dépensé deviendra remboursable aux donateurs. Irréversible."))
      return;
    await tx.run("close", () =>
      writeContractAsync({
        chainId: TARGET_CHAIN_ID,
        address: c.tracker,
        abi: milestoneTrackerAbi,
        functionName: "closeCampaign",
      }),
    );
  }

  return (
    <section className="card space-y-5" aria-labelledby={`org-c-${c.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={`org-c-${c.id}`} className="text-lg font-semibold">
            <Link href={`/campaigns/${c.id}`} className="hover:underline">
              {c.metadata?.name ?? `Campagne #${c.id}`}
            </Link>
          </h2>
          <p className="text-sm text-ink-muted">
            Fonds non engagés : {formatUsdc(c.totalRaised - detail.committed)} · fin de collecte le{" "}
            {formatDate(c.fundingDeadline)}
          </p>
        </div>
        <CampaignStateBadge state={c.state} paused={c.paused} />
      </div>

      <FundingProgress raised={c.totalRaised} softCap={c.softCap} hardCap={c.hardCap} compact />

      {detail.milestones.length > 0 && (
        <ol className="space-y-3">
          {detail.milestones.map((m) => (
            <OrgMilestone key={m.id.toString()} m={m} detail={detail} />
          ))}
        </ol>
      )}

      {canCreate && <CreateMilestoneForm detail={detail} />}

      {c.state === "Active" && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-sm">
          <span className="text-ink-muted">
            {active > 0
              ? "La clôture sera possible quand aucun jalon ne sera en cours."
              : "Tous les jalons sont terminés : vous pouvez clôturer et rendre le reliquat aux donateurs."}
          </span>
          <button type="button" className="btn-secondary" disabled={active > 0 || !!tx.pending} onClick={close}>
            {tx.pending ? "Clôture…" : "Clôturer la campagne"}
          </button>
        </div>
      )}
      {tx.error && <Notice tone="danger">{tx.error}</Notice>}
    </section>
  );
}
