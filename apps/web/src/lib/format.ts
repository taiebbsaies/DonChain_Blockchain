import { formatUnits, parseUnits } from "viem";
import { USDC_DECIMALS } from "@donchain/shared";

const usdcFormatter = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatUsdc(value: bigint): string {
  return `${usdcFormatter.format(Number(formatUnits(value, USDC_DECIMALS)))} USDC`;
}

/** Convertit une saisie utilisateur ("12,5" ou "12.5") en unités USDC ; null si invalide. */
export function parseUsdc(input: string): bigint | null {
  const normalized = input.trim().replace(",", ".");
  if (!/^\d+(\.\d{0,6})?$/.test(normalized)) return null;
  try {
    return parseUnits(normalized, USDC_DECIMALS);
  } catch {
    return null;
  }
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function formatDate(seconds: bigint | number): string {
  return new Date(Number(seconds) * 1000).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatDateTime(seconds: bigint | number): string {
  return new Date(Number(seconds) * 1000).toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Durée lisible : "2 j 4 h", "3 h 12 min", "45 min". */
export function formatDuration(seconds: bigint | number): string {
  let s = Math.max(0, Number(seconds));
  const d = Math.floor(s / 86400);
  s -= d * 86400;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.ceil(s / 60);
  if (d > 0) return `${d} j ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}

/** Erreurs personnalisées des contrats, traduites pour l'utilisateur. */
const CONTRACT_ERRORS: Record<string, string> = {
  NotOrg: "Seule l'organisation attestée de cette campagne peut faire cela.",
  NotAuditor: "Seul un auditeur attesté peut faire cela.",
  NotAttestedOrg: "Votre adresse n'est pas attestée comme organisation.",
  NotAttestedSupplier: "Le prestataire n'est pas (ou plus) attesté.",
  SeparationOfPowers: "Séparation des pouvoirs : l'organisation, le prestataire et l'auditeur doivent être distincts.",
  InvalidParams: "Paramètres invalides (montant, date ou description).",
  ExceedsRaised: "Les jalons engagés dépasseraient le total collecté.",
  MilestoneInProgress: "Un jalon est déjà en cours : terminez-le d'abord.",
  CampaignNotActive: "La campagne n'est pas active (collecte non terminée, échouée ou interrompue).",
  ChallengePeriodActive: "La fenêtre de contestation n'est pas encore close.",
  NotExpired: "Le jalon n'a pas encore dépassé sa date limite et le délai de grâce.",
  SignatureExpired: "La signature a expiré : signez à nouveau.",
  InvalidSignature: "Signature invalide (mauvais signataire ou preuve modifiée depuis).",
  InvalidStatus: "Action impossible dans l'état actuel du jalon.",
  InvalidState: "Action impossible dans l'état actuel de la campagne.",
  BelowMinimum: "Montant inférieur au don minimum.",
  HardCapExceeded: "Ce don dépasserait l'objectif maximal.",
  NothingToRefund: "Rien à rembourser pour cette adresse.",
  EnforcedPause: "La campagne est en pause.",
};

/** Message d'erreur court pour une transaction échouée (viem expose `shortMessage`). */
export function errorMessage(error: unknown): string {
  let text = String(error);
  if (error && typeof error === "object") {
    const e = error as { shortMessage?: string; message?: string };
    text = e.shortMessage ?? e.message ?? "Erreur inconnue";
  }
  for (const [name, message] of Object.entries(CONTRACT_ERRORS)) {
    if (new RegExp(`\\b${name}\\b`).test(text)) return message;
  }
  return text;
}
