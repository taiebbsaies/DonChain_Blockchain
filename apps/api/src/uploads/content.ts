import { createHash } from 'node:crypto';
import { CID } from 'multiformats/cid';
import * as raw from 'multiformats/codecs/raw';
import { sha256 } from 'multiformats/hashes/sha2';

export const UPLOAD_KINDS = ['proof', 'document', 'metadata'] as const;
export type UploadKind = (typeof UPLOAD_KINDS)[number];

/** Types acceptés, reconnus par leur signature binaire (le type annoncé par le client n'est pas fiable). */
export function sniffMime(bytes: Uint8Array): string | null {
  const head = (n: number) => Buffer.from(bytes.subarray(0, n));
  if (head(5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (head(8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (head(3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg';
  if (head(4).toString('latin1') === 'RIFF' && Buffer.from(bytes.subarray(8, 12)).toString('latin1') === 'WEBP') {
    return 'image/webp';
  }
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const parsed: unknown = JSON.parse(text);
    if (parsed !== null && typeof parsed === 'object') return 'application/json';
  } catch {
    /* pas du JSON */
  }
  return null;
}

/** Types autorisés par nature de fichier : les métadonnées publiques sont du JSON. */
export const ALLOWED_MIME: Record<UploadKind, string[]> = {
  proof: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'application/json'],
  document: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'application/json'],
  metadata: ['application/json'],
};

/**
 * CID v1 « raw » (sha2-256) du contenu : identique à `ipfs add --cid-version 1 --raw-leaves` pour un fichier
 * d'un seul bloc. N'importe qui peut le recalculer depuis le fichier pour vérifier qu'il correspond à la chaîne.
 */
export async function rawCid(bytes: Uint8Array): Promise<string> {
  return CID.create(1, raw.code, await sha256.digest(bytes)).toString();
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
