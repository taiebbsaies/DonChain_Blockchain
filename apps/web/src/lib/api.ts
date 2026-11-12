"use client";

import { useSyncExternalStore } from "react";
import type { Address } from "viem";
import { createSiweMessage } from "viem/siwe";

/** URL de l'API DonChain (Phase 2). Vide = pas de backend : l'application lit la chaîne seule. */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
export const apiEnabled = API_URL !== "";

type Session = { token: string; address: Address; expiresAt: number; roles: string[] };

// Jeton gardé en mémoire uniquement (jamais en localStorage) : 15 min, perdu au rechargement.
let session: Session | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function useApiSession(address: Address | undefined): Session | null {
  const s = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => session,
    () => null,
  );
  if (!s || !address || s.address.toLowerCase() !== address.toLowerCase()) return null;
  return s;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, init);
  if (!res.ok) {
    let message = `Erreur API ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (body.message) message = Array.isArray(body.message) ? body.message.join(" ") : body.message;
    } catch {
      /* corps non JSON */
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

/** Connexion « Sign-In with Ethereum » : une signature, aucune transaction, aucun frais. */
export async function signIn(
  address: Address,
  chainId: number,
  signMessage: (args: { message: string }) => Promise<`0x${string}`>,
): Promise<void> {
  const { nonce } = await api<{ nonce: string }>("/auth/nonce", { method: "POST" });
  const message = createSiweMessage({
    domain: window.location.host,
    address,
    uri: window.location.origin,
    version: "1",
    chainId,
    nonce,
    statement: "Connexion à DonChain pour téléverser des documents. Cette signature ne coûte rien.",
    expirationTime: new Date(Date.now() + 10 * 60 * 1000),
  });
  const signature = await signMessage({ message });
  const result = await api<{ token: string; address: Address; expiresAt: string; roles: string[] }>("/auth/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, signature }),
  });
  session = { ...result, expiresAt: new Date(result.expiresAt).getTime() };
  emit();
  // Jeton expiré : on oublie la session (l'utilisateur signera de nouveau)
  const current = session;
  setTimeout(() => {
    if (session === current) {
      session = null;
      emit();
    }
  }, Math.max(0, current.expiresAt - Date.now() - 5_000));
}

export type UploadKind = "proof" | "document" | "metadata";
export type UploadResult = { cid: string; uri: string; gatewayUrl: string; sha256: string; size: number; mime: string };

export async function uploadFile(token: string, file: Blob, kind: UploadKind, name = "document"): Promise<UploadResult> {
  const form = new FormData();
  form.append("file", file, name);
  return api<UploadResult>(`/uploads?kind=${kind}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
}

/** Publie un JSON public sur IPFS via l'API ; ipfs://<CID>. */
export async function uploadJson(token: string, doc: object): Promise<string> {
  const blob = new Blob([JSON.stringify(doc)], { type: "application/json" });
  return (await uploadFile(token, blob, "metadata", "metadata.json")).uri;
}

// ---------------- Explorateur ----------------

export type FlowRow = {
  time: number;
  block: number;
  txHash: string;
  logIndex: number;
  category: "donation" | "release" | "refund" | "deposit" | "milestone" | "campaign";
  event: string;
  label: string;
  milestoneId: number | null;
  party: string | null;
  amount: string | null;
};

export function fetchFlows(id: bigint): Promise<FlowRow[]> {
  return api<FlowRow[]>(`/campaigns/${id}/flows`);
}

export function fetchApiHealth(): Promise<{ indexedBlock: number | null; headBlock: number | null; lag: number | null }> {
  return api(`/health`);
}

export const exportUrl = (id: bigint, format: "csv" | "pdf") => `${API_URL}/campaigns/${id}/export.${format}`;

/**
 * Publie un document JSON public : sur IPFS via l'API si une session est ouverte, sinon en URI data:
 * (mode sans backend de la Phase 1, toujours valide on-chain).
 */
export async function publishJson(session: Session | null, doc: object, fallback: (doc: object) => string) {
  return session ? uploadJson(session.token, doc) : fallback(doc);
}
