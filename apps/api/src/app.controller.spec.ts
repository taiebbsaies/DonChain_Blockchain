import { AppController } from './app.controller.js';
import type { ChainService } from './chain/chain.service.js';
import type { ExplorerService } from './explorer/explorer.service.js';

describe('AppController', () => {
  it('signale le retard de l’indexeur sur la chaîne', async () => {
    const explorer = { status: async () => ({ chainId: 31337, indexedBlock: 40 }) } as unknown as ExplorerService;
    const chain = { client: { getBlockNumber: async () => 45n } } as unknown as ChainService;
    const health = await new AppController(explorer, chain).health();
    expect(health).toMatchObject({ ok: true, chainId: 31337, indexedBlock: 40, headBlock: 45, lag: 5 });
  });

  it('reste disponible si le nœud RPC ne répond pas', async () => {
    const explorer = { status: async () => ({ chainId: 31337, indexedBlock: null }) } as unknown as ExplorerService;
    const chain = {
      client: {
        getBlockNumber: async () => {
          throw new Error('RPC indisponible');
        },
      },
    } as unknown as ChainService;
    expect(await new AppController(explorer, chain).health()).toMatchObject({ ok: true, headBlock: null, lag: null });
  });
});
