import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config.js';

export type PinResult = { cid: string; primary: string | null; secondary: string | null };

/**
 * Épinglage IPFS : Pinata en principal, un service compatible « IPFS Pinning Service API » en secondaire
 * (Filebase, 4EVERLAND…) pour ne pas dépendre d'un seul fournisseur (§11).
 * Sans PINATA_JWT (développement local), le fichier est conservé en base et servi par GET /ipfs/:cid.
 */
@Injectable()
export class PinningService {
  private readonly logger = new Logger(PinningService.name);

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  get localMode(): boolean {
    return !this.config.pinataJwt;
  }

  async pin(bytes: Uint8Array, name: string, mime: string, localCid: string): Promise<PinResult> {
    if (this.localMode) return { cid: localCid, primary: null, secondary: null };

    const cid = await this.pinata(bytes, name, mime);
    let secondary: string | null = null;
    if (this.config.secondaryPinUrl && this.config.secondaryPinToken) {
      try {
        secondary = await this.pinByCid(cid, name);
      } catch (e) {
        // L'épinglage secondaire ne bloque pas le téléversement : il sera visible comme manquant
        this.logger.warn(`Épinglage secondaire échoué pour ${cid} : ${(e as Error).message}`);
      }
    }
    return { cid, primary: 'pinata', secondary };
  }

  private async pinata(bytes: Uint8Array, name: string, mime: string): Promise<string> {
    const form = new FormData();
    form.append('file', new Blob([Buffer.from(bytes)], { type: mime }), name);
    form.append('network', 'public');
    form.append('name', name);
    const res = await fetch('https://uploads.pinata.cloud/v3/files', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.config.pinataJwt}` },
      body: form,
    });
    if (!res.ok) throw new Error(`Pinata a répondu ${res.status}`);
    const json = (await res.json()) as { data?: { cid?: string } };
    if (!json.data?.cid) throw new Error('Réponse Pinata sans CID');
    return json.data.cid;
  }

  private async pinByCid(cid: string, name: string): Promise<string> {
    const res = await fetch(`${this.config.secondaryPinUrl!.replace(/\/$/, '')}/pins`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.config.secondaryPinToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ cid, name }),
    });
    if (!res.ok) throw new Error(`service secondaire : ${res.status}`);
    return new URL(this.config.secondaryPinUrl!).host;
  }
}
