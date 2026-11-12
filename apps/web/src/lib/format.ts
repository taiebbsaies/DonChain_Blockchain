import { formatUnits, parseUnits } from "viem";
import { USDC_DECIMALS } from "@donchain/shared";

const usdcFormatter = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatUsdc(value: bigint): string {
  return `${usdcFormatter.format(Number(formatUnits(value, USDC_DECIMALS)))} USDC`;
}

/**
 * Normalise une saisie de montant en notation décimale à point ("1234.5"), ou null si invalide.
 *
 * Formats acceptés :
 *  - français : "1 000", "1 000,50", "12,5" (espaces, y compris insécables, comme séparateurs de milliers)
 *  - points de milliers : "1.000", "1.000.000", "1.000,50"
 *  - anglais : "1,000.50", "12.5"
 *
 * Règles :
 *  - si "," et "." sont présents, le dernier des deux est le séparateur décimal ;
 *  - "," seule est toujours décimale (usage français) : "1,000" = 1 ;
 *  - "." seul suivi de groupes d'exactement 3 chiffres ("1.000", "12.500.000") est un séparateur
 *    de milliers ; sinon c'est la virgule décimale ("12.5", "0.250", "1234.567").
 */
export function normalizeAmountInput(input: string): string | null {
  let s = input.trim().replace(/[\s  ']/g, "");
  if (s === "") return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  if (lastComma !== -1 && lastDot !== -1) {
    const decimal = lastComma > lastDot ? "," : ".";
    const thousands = decimal === "," ? "." : ",";
    const [intPart, fracPart, ...rest] = s.split(decimal);
    if (rest.length > 0) return null;
    if (intPart.includes(thousands) && !new RegExp(`^\\d{1,3}(\\${thousands}\\d{3})+$`).test(intPart)) return null;
    s = `${intPart.replaceAll(thousands, "")}.${fracPart}`;
  } else if (lastComma !== -1) {
    if (s.indexOf(",") !== lastComma) return null; // "1,000,000" est ambigu en français : refusé
    s = s.replace(",", ".");
  } else if (lastDot !== -1) {
    if (/^\d{1,3}(\.\d{3})+$/.test(s) && !/^0\./.test(s)) {
      s = s.replaceAll(".", "");
    } else if (s.indexOf(".") !== lastDot) {
      return null;
    }
  }

  if (!/^\d+(\.\d*)?$/.test(s)) return null;
  return s.endsWith(".") ? s.slice(0, -1) : s;
}

/** Convertit une saisie utilisateur en unités USDC ; null si invalide ou plus de 6 décimales. */
export function parseUsdc(input: string): bigint | null {
  const normalized = normalizeAmountInput(input);
  if (normalized === null || !/^\d+(\.\d{0,6})?$/.test(normalized)) return null;
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
  NotDonor: "Seuls les donateurs de cette campagne peuvent contester un jalon.",
  NotResolver: "Seul un arbitre ou un auditeur attesté peut trancher une contestation.",
  AlreadyDisputed: "Ce jalon a déjà été contesté une fois.",
  ChallengePeriodOver: "La fenêtre de contestation est close.",
  SameAuditor: "La seconde approbation doit venir d'un autre auditeur.",
  ERC20InsufficientAllowance: "Autorisez d'abord l'USDC pour la caution.",
  ERC20InsufficientBalance: "Solde USDC insuffisant.",
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
