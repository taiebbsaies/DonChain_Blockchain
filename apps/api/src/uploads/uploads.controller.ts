import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { IsIn } from 'class-validator';
import type { Response } from 'express';
import { AuthGuard, RequireRoles, type AuthedRequest } from '../auth/auth.guard.js';
import { UPLOAD_KINDS, type UploadKind } from './content.js';
import { UploadsService } from './uploads.service.js';

class UploadQuery {
  @IsIn(UPLOAD_KINDS)
  kind: UploadKind;
}

// Limite dure côté serveur (la limite configurable est vérifiée ensuite par le service)
const HARD_LIMIT = 25 * 1024 * 1024;

@Controller()
export class UploadsController {
  constructor(@Inject(UploadsService) private readonly uploads: UploadsService) {}

  /** Téléversement réservé aux organisations attestées (preuves, devis, métadonnées de campagne). */
  @Post('uploads')
  @UseGuards(AuthGuard)
  @RequireRoles('org')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: HARD_LIMIT, files: 1 } }))
  upload(
    @UploadedFile() file: { buffer: Buffer; size: number } | undefined,
    @Query() query: UploadQuery,
    @Req() req: AuthedRequest,
  ) {
    if (!file) throw new BadRequestException('Champ « file » manquant.');
    return this.uploads.upload(new Uint8Array(file.buffer), query.kind, req.user.address);
  }

  @Get('ipfs/:cid')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  @Header('X-Content-Type-Options', 'nosniff')
  async gateway(@Param('cid') cid: string, @Res() res: Response) {
    if (!/^[a-zA-Z0-9]{20,100}$/.test(cid)) throw new BadRequestException('CID invalide.');
    const { mime, content } = await this.uploads.content(cid);
    res.setHeader('Content-Type', mime);
    // Jamais exécuté dans l'origine de l'API
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.send(content);
  }
}
