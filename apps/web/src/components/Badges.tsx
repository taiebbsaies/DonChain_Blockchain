import type { CampaignState, MilestoneStatus } from "@donchain/shared";

const CAMPAIGN_LABELS: Record<CampaignState, { label: string; tone: string }> = {
  Funding: { label: "Collecte en cours", tone: "tone-info" },
  Active: { label: "Active", tone: "tone-success" },
  Failed: { label: "Échouée (remboursable)", tone: "tone-danger" },
  Halted: { label: "Interrompue (remboursable)", tone: "tone-danger" },
  Completed: { label: "Clôturée", tone: "tone-neutral" },
};

const MILESTONE_LABELS: Record<MilestoneStatus, { label: string; tone: string }> = {
  Draft: { label: "Brouillon", tone: "tone-neutral" },
  Pending: { label: "Fonds réservés", tone: "tone-info" },
  Submitted: { label: "Preuve soumise", tone: "tone-info" },
  Approved: { label: "Approuvé", tone: "tone-success" },
  Released: { label: "Payé", tone: "tone-success" },
  Rejected: { label: "Rejeté", tone: "tone-danger" },
  Cancelled: { label: "Annulé", tone: "tone-neutral" },
  Expired: { label: "Expiré", tone: "tone-danger" },
};

export function CampaignStateBadge({ state, paused }: { state: CampaignState; paused?: boolean }) {
  if (paused) return <span className="badge tone-warning">En pause</span>;
  const { label, tone } = CAMPAIGN_LABELS[state];
  return <span className={`badge ${tone}`}>{label}</span>;
}

export function MilestoneStatusBadge({ status }: { status: MilestoneStatus }) {
  const { label, tone } = MILESTONE_LABELS[status];
  return <span className={`badge ${tone}`}>{label}</span>;
}
