import { formatUsdc, parseUsdc } from "@/lib/format";

/** Rappelle sous un champ le montant réellement compris ("1.000" → 1 000,00 USDC). */
export function AmountEcho({ value }: { value: string }) {
  if (!value.trim()) return null;
  const amount = parseUsdc(value);
  return (
    <p className={`mt-1 text-xs ${amount === null ? "text-danger" : "text-ink-muted"}`} aria-live="polite">
      {amount === null ? "Montant non reconnu (ex. 1 000 ou 12,50)." : `= ${formatUsdc(amount)}`}
    </p>
  );
}
