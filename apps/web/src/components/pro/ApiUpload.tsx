"use client";

import { useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { TARGET_CHAIN_ID } from "@/lib/config";
import { apiEnabled, signIn, uploadFile, useApiSession, type UploadKind } from "@/lib/api";
import { errorMessage } from "@/lib/format";

/** Connexion SIWE à l'API (une signature gratuite), affichée seulement si l'API est configurée. */
export function ApiSignIn({ compact = false }: { compact?: boolean }) {
  const { address } = useAccount();
  const session = useApiSession(address);
  const { signMessageAsync } = useSignMessage();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!apiEnabled || !address || session) return null;
  return (
    <div className={compact ? "inline-flex flex-col" : "flex flex-col gap-1"}>
      <button
        type="button"
        className="btn-secondary text-sm"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          try {
            await signIn(address, TARGET_CHAIN_ID, signMessageAsync);
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? "Signature… (voir le portefeuille)" : "Se connecter pour téléverser (signature gratuite)"}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}

/** Téléverse un fichier sur IPFS via l'API et renvoie son ipfs://CID. */
export function FileUpload({
  kind,
  onUploaded,
  label = "Téléverser un fichier",
}: {
  kind: UploadKind;
  onUploaded: (uri: string) => void;
  label?: string;
}) {
  const { address } = useAccount();
  const session = useApiSession(address);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (!apiEnabled) return null;
  if (!session) return <ApiSignIn compact />;

  return (
    <div className="flex flex-col gap-1">
      <label className="btn-secondary cursor-pointer text-sm">
        {pending ? "Téléversement…" : label}
        <input
          type="file"
          className="sr-only"
          accept="application/pdf,image/png,image/jpeg,image/webp,application/json"
          disabled={pending}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setPending(true);
            setError(null);
            try {
              const res = await uploadFile(session.token, file, kind, file.name);
              setDone(`${res.cid.slice(0, 14)}… (${Math.ceil(res.size / 1024)} Ko)`);
              onUploaded(res.uri);
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setPending(false);
            }
          }}
        />
      </label>
      {done && <span className="text-xs text-success">✓ Épinglé sur IPFS : {done}</span>}
      {error && <span className="text-xs text-danger">{error}</span>}
      <span className="text-xs text-ink-muted">PDF, PNG, JPEG, WebP ou JSON. Aucune donnée personnelle.</span>
    </div>
  );
}
