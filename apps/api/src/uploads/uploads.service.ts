import { BadRequestException, Inject, Injectable, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import type { Address } from 'viem';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { DatabaseService } from '../db/database.service.js';
import { ALLOWED_MIME, rawCid, sha256Hex, sniffMime, type UploadKind } from './content.js';
import { PinningService } from './pinning.service.js';

@Injectable()
export class UploadsService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(PinningService) private readonly pinning: PinningService,
  ) {}

  async upload(bytes: Uint8Array, kind: UploadKind, uploader: Address) {
    if (bytes.byteLength === 0) throw new BadRequestException('Fichier vide.');
    if (bytes.byteLength > this.config.uploadMaxBytes) throw new PayloadTooLargeException('Fichier trop volumineux.');
    const mime = sniffMime(bytes);
    if (!mime || !ALLOWED_MIME[kind].includes(mime)) {
      throw new BadRequestException(`Type de fichier non accepté pour « ${kind} » (${ALLOWED_MIME[kind].join(', ')}).`);
    }

    const localCid = await rawCid(bytes);
    const sha256 = sha256Hex(bytes);
    // Nom neutre côté IPFS : jamais le nom d'origine (peut contenir des données personnelles, §12)
    const name = `donchain-${kind}-${sha256.slice(0, 16)}`;
    const pinned = await this.pinning.pin(bytes, name, mime, localCid);

    await this.db.query(
      `insert into files (cid, sha256, size, mime, kind, uploader, primary_pin, secondary_pin, content)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (cid) do nothing`,
      [
        pinned.cid,
        sha256,
        bytes.byteLength,
        mime,
        kind,
        uploader.toLowerCase(),
        pinned.primary,
        pinned.secondary,
        this.pinning.localMode ? Buffer.from(bytes) : null,
      ],
    );

    return {
      cid: pinned.cid,
      uri: `ipfs://${pinned.cid}`,
      gatewayUrl: `${this.config.publicGateway}/ipfs/${pinned.cid}`,
      sha256,
      size: bytes.byteLength,
      mime,
      pinned: { primary: pinned.primary ?? 'local', secondary: pinned.secondary },
    };
  }

  /** Passerelle locale (mode développement) : sert le contenu exact téléversé. */
  async content(cid: string): Promise<{ mime: string; content: Buffer }> {
    const { rows } = await this.db.query<{ mime: string; content: Buffer | null }>(
      'select mime, content from files where cid = $1',
      [cid],
    );
    if (!rows[0]?.content) throw new NotFoundException('Contenu inconnu de cette passerelle.');
    return { mime: rows[0].mime, content: rows[0].content };
  }
}
