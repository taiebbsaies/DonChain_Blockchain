import { targetChain } from "@/lib/config";
import { shortAddress } from "@/lib/format";

/** Adresse abrégée ; lien vers l'explorateur si le réseau en a un. */
export function AddressText({ address, label }: { address: string; label?: string }) {
  const explorer = targetChain.blockExplorers?.default.url;
  const text = <span className="font-mono">{shortAddress(address)}</span>;
  return (
    <span title={address}>
      {label && <span className="text-ink-muted">{label} </span>}
      {explorer ? (
        <a href={`${explorer}/address/${address}`} target="_blank" rel="noreferrer" className="link">
          {text}
        </a>
      ) : (
        text
      )}
    </span>
  );
}
