import { Controller, Get, Header, Inject, Param, ParseIntPipe, Res } from '@nestjs/common';
import type { Response } from 'express';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { ExplorerService } from './explorer.service.js';
import { toCsv } from './flows.js';
import { campaignPdf } from './pdf.js';

/** Explorateur public : lecture seule, sans authentification (données déjà publiques on-chain). */
@Controller()
export class ExplorerController {
  constructor(
    @Inject(ExplorerService) private readonly explorer: ExplorerService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get('campaigns')
  list() {
    return this.explorer.list();
  }

  @Get('campaigns/:id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.explorer.get(id);
  }

  @Get('campaigns/:id/flows')
  flows(@Param('id', ParseIntPipe) id: number) {
    return this.explorer.flows(id);
  }

  @Get('campaigns/:id/export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async csv(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const csv = toCsv(await this.explorer.flows(id));
    res.setHeader('Content-Disposition', `attachment; filename="donchain-campagne-${id}.csv"`);
    res.send(csv);
  }

  @Get('campaigns/:id/export.pdf')
  async pdf(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const [campaign, flows] = await Promise.all([this.explorer.get(id), this.explorer.flows(id)]);
    const pdf = await campaignPdf(campaign, flows, this.config.chainId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="donchain-campagne-${id}.pdf"`);
    res.send(pdf);
  }
}
