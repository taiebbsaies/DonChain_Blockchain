import { IPFS_GATEWAY } from "./config";

export type CampaignMetadata = { name: string; description?: string; image?: string };
export type MilestoneMetadata = { title: string; quote?: string };

/** Convertit ipfs://<CID> en URL de passerelle HTTP ; laisse les autres URI inchangées. */
export function toHttpUrl(uri: string): string {
  return uri.startsWith("ipfs://") ? `${IPFS_GATEWAY}/ipfs/${uri.slice("ipfs://".length)}` : uri;
}

/**
 * Lit un document JSON public (métadonnées de campagne ou description de jalon).
 * Accepte data:application/json;base64,…, ipfs://… et http(s)://…. Retourne null en cas d'échec.
 */
export async function resolveJson<T>(uri: string): Promise<T | null> {
  try {
    const base64Prefix = "data:application/json;base64,";
    if (uri.startsWith(base64Prefix)) {
      const binary = atob(uri.slice(base64Prefix.length));
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      return JSON.parse(new TextDecoder().decode(bytes)) as T;
    }
    if (uri.startsWith("ipfs://") || uri.startsWith("https://") || uri.startsWith("http://")) {
      const res = await fetch(toHttpUrl(uri));
      if (!res.ok) return null;
      return (await res.json()) as T;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Encode un document JSON public en URI data: (Phase 1, sans IPFS).
 * Phase 2 : téléversement sur IPFS via le backend, puis ipfs://<CID>.
 */
export function toDataUri(doc: object): string {
  const bytes = new TextEncoder().encode(JSON.stringify(doc));
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return `data:application/json;base64,${btoa(binary)}`;
}

/** Lien HTTP vers une preuve : CID nu, ipfs://CID ou URL complète. */
export function proofUrl(cid: string): string {
  return cid.includes("://") ? toHttpUrl(cid) : `${IPFS_GATEWAY}/ipfs/${cid}`;
}
