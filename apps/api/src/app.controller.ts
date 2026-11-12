import { Controller, Get, Inject } from '@nestjs/common';
import { ChainService } from './chain/chain.service.js';
import { ExplorerService } from './explorer/explorer.service.js';

@Controller()
export class AppController {
  constructor(
    @Inject(ExplorerService) private readonly explorer: ExplorerService,
    @Inject(ChainService) private readonly chain: ChainService,
  ) {}

  /** État de l'API et retard de l'indexeur sur la chaîne. */
  @Get('health')
  async health() {
    const [status, head] = await Promise.all([
      this.explorer.status(),
      this.chain.client.getBlockNumber({ cacheTime: 0 }).catch(() => null),
    ]);
    return {
      ok: true,
      ...status,
      headBlock: head === null ? null : Number(head),
      lag: head === null || status.indexedBlock === null ? null : Number(head) - status.indexedBlock,
    };
  }
}
