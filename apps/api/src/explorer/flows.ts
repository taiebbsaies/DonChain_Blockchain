/** Conversion des événements indexés en lignes lisibles du « flux des fonds » (§4.5). */

export type EventRow = {
  block_number: string;
  block_time: string;
  tx_hash: string;
  log_index: number;
  contract: string;
  event_name: string;
  args: Record<string, string | number | boolean>;
};

export type FlowRow = {
  time: number;
  block: number;
  txHash: string;
  logIndex: number;
  /** Mouvement d'argent (in/out du séquestre) ou étape de gouvernance. */
  category: 'donation' | 'release' | 'refund' | 'deposit' | 'milestone' | 'campaign';
  event: string;
  label: string;
  milestoneId: number | null;
  /** Adresse à l'origine de l'action, ou bénéficiaire du paiement. */
  party: string | null;
  /** Montant en unités USDC (6 décimales), chaîne décimale entière. */
  amount: string | null;
};

const LABELS: Record<string, string> = {
  DonationReceived: 'Don reçu',
  RefundIssued: 'Remboursement',
  FundsReleased: 'Paiement au prestataire',
  MilestoneCreated: 'Jalon créé',
  MilestoneLocked: 'Fonds réservés pour le jalon',
  MilestoneSubmitted: 'Preuve soumise',
  DeliveryConfirmed: 'Livraison confirmée (prestataire)',
  ApprovalRecorded: 'Première approbation (auditeur)',
  MilestoneApproved: 'Jalon approuvé (auditeur)',
  MilestoneRejected: 'Jalon rejeté',
  MilestoneCancelled: 'Jalon annulé',
  MilestoneExpired: 'Jalon expiré',
  MilestoneReleased: 'Jalon payé',
  DisputeOpened: 'Contestation ouverte (donateur)',
  DisputeResolved: 'Contestation tranchée',
  CampaignCreated: 'Campagne créée',
  CampaignHalted: 'Campagne interrompue',
  CampaignCompleted: 'Campagne clôturée',
  CampaignClosed: 'Clôture demandée',
  Paused: 'Mise en pause',
  Unpaused: 'Fin de pause',
};

const CATEGORY: Record<string, FlowRow['category']> = {
  DonationReceived: 'donation',
  FundsReleased: 'release',
  RefundIssued: 'refund',
  DisputeOpened: 'deposit',
  CampaignCreated: 'campaign',
  CampaignHalted: 'campaign',
  CampaignCompleted: 'campaign',
  CampaignClosed: 'campaign',
  Paused: 'campaign',
  Unpaused: 'campaign',
};

/** Événements doublons d'un autre (même transaction) : non affichés dans le flux. */
const HIDDEN = new Set(['MilestoneReleased', 'Locked', 'Transfer', 'Initialized']);

export function toFlowRow(e: EventRow): FlowRow | null {
  if (HIDDEN.has(e.event_name)) return null;
  const a = e.args;
  const str = (k: string) => (a[k] === undefined ? null : String(a[k]));
  const milestoneId = a.id ?? a.milestoneId;
  return {
    time: Number(e.block_time),
    block: Number(e.block_number),
    txHash: e.tx_hash,
    logIndex: e.log_index,
    category: CATEGORY[e.event_name] ?? 'milestone',
    event: e.event_name,
    label:
      e.event_name === 'DisputeResolved'
        ? a.upheld
          ? 'Contestation retenue (jalon rejeté)'
          : 'Contestation rejetée'
        : (LABELS[e.event_name] ?? e.event_name),
    milestoneId: milestoneId === undefined ? null : Number(milestoneId),
    party: str('donor') ?? str('supplier') ?? str('disputer') ?? str('auditor') ?? str('resolver') ?? str('org') ?? str('account'),
    amount: str('amount') ?? (e.event_name === 'DisputeOpened' ? str('deposit') : null),
  };
}

/** 1234567 -> "1.234567" (unités USDC à 6 décimales, sans perte). */
export function formatUnits6(amount: string | null): string {
  if (amount === null) return '';
  const neg = amount.startsWith('-');
  const digits = (neg ? amount.slice(1) : amount).padStart(7, '0');
  const int = digits.slice(0, -6);
  const frac = digits.slice(-6).replace(/0+$/, '');
  return `${neg ? '-' : ''}${int}${frac ? `.${frac}` : ''}`;
}

function csvCell(value: string | number | null): string {
  const s = value === null ? '' : String(value);
  // Neutralise les formules (injection CSV dans Excel / LibreOffice)
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",;\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: FlowRow[]): string {
  const header = ['date_utc', 'bloc', 'transaction', 'categorie', 'evenement', 'libelle', 'jalon', 'adresse', 'montant_usdc'];
  const lines = rows.map((r) =>
    [
      new Date(r.time * 1000).toISOString(),
      r.block,
      r.txHash,
      r.category,
      r.event,
      r.label,
      r.milestoneId === null ? '' : r.milestoneId + 1,
      r.party,
      formatUnits6(r.amount),
    ]
      .map(csvCell)
      .join(','),
  );
  // BOM UTF-8 : accents corrects à l'ouverture dans Excel
  return '﻿' + [header.join(','), ...lines].join('\r\n') + '\r\n';
}
