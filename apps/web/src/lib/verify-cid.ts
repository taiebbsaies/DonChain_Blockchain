import { CID } from "multiformats/cid";
import * as raw from "multiformats/codecs/raw";
import { sha256 } from "multiformats/hashes/sha2";
import { proofUrl } from "./metadata";

export type CidCheck =
  | { status: "match" }
  | { status: "mismatch" }
  | { status: "unsupported"; reason: string }
  | { status: "error"; reason: string };

/**
 * Vérifie dans le navigateur que le fichier servi par la passerelle correspond bien au CID enregistré
 * on-chain (§4.5) : on recalcule l'empreinte sha2-256 du contenu et on la compare à celle du CID.
 * Possible pour les CID v1 « raw » (bafkrei…), produits par l'API DonChain. Les CID UnixFS découpés
 * (bafybei…, Qm…) exigeraient de reconstruire l'arbre IPFS : signalés comme non vérifiables ici.
 */
export async function verifyCid(value: string): Promise<CidCheck> {
  const text = value.replace(/^ipfs:\/\//, "").split("/")[0];
  let cid: CID;
  try {
    cid = CID.parse(text);
  } catch {
    return { status: "unsupported", reason: "Ce n'est pas un CID IPFS." };
  }
  if (cid.code !== raw.code || cid.multihash.code !== sha256.code) {
    return { status: "unsupported", reason: "Format UnixFS : vérification locale indisponible." };
  }
  try {
    const res = await fetch(proofUrl(value));
    if (!res.ok) return { status: "error", reason: `Passerelle : ${res.status}` };
    const bytes = new Uint8Array(await res.arrayBuffer());
    const digest = await sha256.digest(bytes);
    const same =
      digest.digest.length === cid.multihash.digest.length &&
      digest.digest.every((b, i) => b === cid.multihash.digest[i]);
    return { status: same ? "match" : "mismatch" };
  } catch (e) {
    return { status: "error", reason: (e as Error).message };
  }
}
