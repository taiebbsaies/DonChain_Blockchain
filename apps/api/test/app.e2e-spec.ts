import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createPublicClient, createWalletClient, http, parseAbi, type Hex } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';
import { createSiweMessage } from 'viem/siwe';

/**
 * Tests de bout en bout : nécessitent anvil avec la démo (`pnpm chain` puis `pnpm chain:seed`)
 * et PostgreSQL (TEST_DATABASE_URL, défaut postgres://donchain:donchain@127.0.0.1:5432/donchain_test).
 */
const RPC = 'http://127.0.0.1:8545';
const MNEMONIC = 'test test test test test test test test test test test junk';
const account = (i: number) => mnemonicToAccount(MNEMONIC, { addressIndex: i });
const ORG = account(1);
const DONOR = account(5);

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://donchain:donchain@127.0.0.1:5432/donchain_test';
process.env.INDEXER_ENABLED = 'false';
process.env.CHAIN_ID = '31337';
process.env.PINATA_JWT = '';

const chain = createPublicClient({ chain: foundry, transport: http(RPC) });
const reachable = await chain.getBlockNumber().then(
  () => true,
  () => false,
);

describe.skipIf(!reachable)('API DonChain (e2e)', () => {
  let app: INestApplication;
  let indexer: import('../src/indexer/indexer.service.js').IndexerService;

  beforeAll(async () => {
    const { AppModule } = await import('../src/app.module.js');
    const { configureApp } = await import('../src/bootstrap.js');
    const { IndexerService } = await import('../src/indexer/indexer.service.js');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    indexer = app.get(IndexerService);
    await indexer.rebuild();
  });

  afterAll(async () => {
    await app?.close();
  });

  async function login(acc: ReturnType<typeof account>): Promise<string> {
    const { body } = await request(app.getHttpServer()).post('/auth/nonce').expect(200);
    const message = createSiweMessage({
      domain: 'localhost:3000',
      address: acc.address,
      uri: 'http://localhost:3000',
      version: '1',
      chainId: 31337,
      nonce: body.nonce,
      statement: 'Connexion à DonChain',
    });
    const signature = await acc.signMessage({ message });
    const res = await request(app.getHttpServer()).post('/auth/verify').send({ message, signature }).expect(200);
    return res.body.token as string;
  }

  it('indexe les campagnes de démonstration', async () => {
    const { body } = await request(app.getHttpServer()).get('/campaigns').expect(200);
    expect(body.length).toBeGreaterThanOrEqual(3);
    const b = body.find((c: { id: number }) => c.id === 1);
    expect(b.totals.raised).toBe('3000000000');
    expect(b.donors).toBe(3);
  });

  it('expose le flux des fonds et les exports CSV / PDF', async () => {
    const flows = await request(app.getHttpServer()).get('/campaigns/1/flows').expect(200);
    expect(flows.body[0].event).toBe('CampaignCreated');
    expect(flows.body.filter((f: { category: string }) => f.category === 'donation')).toHaveLength(3);

    const csv = await request(app.getHttpServer()).get('/campaigns/1/export.csv').expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('date_utc,bloc,transaction');
    expect(csv.text).toContain('1500,'.replace(',', '')); // 1 500 USDC en unités lisibles

    const pdf = await request(app.getHttpServer()).get('/campaigns/1/export.pdf').buffer(true).expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(Buffer.from(pdf.body).subarray(0, 5).toString()).toBe('%PDF-');

    await request(app.getHttpServer()).get('/campaigns/999').expect(404);
    await request(app.getHttpServer()).get('/campaigns/abc').expect(400);
  });

  it('SIWE : nonce à usage unique, jeton court, rôles on-chain', async () => {
    const token = await login(ORG);
    const me = await request(app.getHttpServer()).get('/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
    expect(me.body.address).toBe(ORG.address);
    expect(me.body.roles).toContain('org');

    // Rejeu du même message signé : refusé (nonce consommé)
    const { body } = await request(app.getHttpServer()).post('/auth/nonce').expect(200);
    const message = createSiweMessage({
      domain: 'localhost:3000',
      address: ORG.address,
      uri: 'http://localhost:3000',
      version: '1',
      chainId: 31337,
      nonce: body.nonce,
    });
    const signature = await ORG.signMessage({ message });
    await request(app.getHttpServer()).post('/auth/verify').send({ message, signature }).expect(200);
    await request(app.getHttpServer()).post('/auth/verify').send({ message, signature }).expect(401);

    await request(app.getHttpServer()).get('/auth/me').set('Authorization', 'Bearer faux').expect(401);
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('SIWE : refuse un domaine non autorisé et une signature d’un autre compte', async () => {
    const { body } = await request(app.getHttpServer()).post('/auth/nonce').expect(200);
    const evil = createSiweMessage({
      domain: 'evil.example',
      address: ORG.address,
      uri: 'https://evil.example',
      version: '1',
      chainId: 31337,
      nonce: body.nonce,
    });
    await request(app.getHttpServer())
      .post('/auth/verify')
      .send({ message: evil, signature: await ORG.signMessage({ message: evil }) })
      .expect(401);

    const { body: b2 } = await request(app.getHttpServer()).post('/auth/nonce').expect(200);
    const msg = createSiweMessage({
      domain: 'localhost:3000',
      address: ORG.address,
      uri: 'http://localhost:3000',
      version: '1',
      chainId: 31337,
      nonce: b2.nonce,
    });
    await request(app.getHttpServer())
      .post('/auth/verify')
      .send({ message: msg, signature: await DONOR.signMessage({ message: msg }) })
      .expect(401);
  });

  it('téléversement : réservé aux organisations, types vérifiés, servi par la passerelle locale', async () => {
    const orgToken = await login(ORG);
    const donorToken = await login(DONOR);
    const json = Buffer.from(JSON.stringify({ name: 'Test', description: 'Campagne e2e' }));

    await request(app.getHttpServer())
      .post('/uploads?kind=metadata')
      .set('Authorization', `Bearer ${donorToken}`)
      .attach('file', json, 'meta.json')
      .expect(403);

    const up = await request(app.getHttpServer())
      .post('/uploads?kind=metadata')
      .set('Authorization', `Bearer ${orgToken}`)
      .attach('file', json, 'meta.json')
      .expect(201);
    expect(up.body.cid).toMatch(/^bafkrei/);
    expect(up.body.uri).toBe(`ipfs://${up.body.cid}`);

    const served = await request(app.getHttpServer()).get(`/ipfs/${up.body.cid}`).expect(200);
    expect(served.headers['content-type']).toContain('application/json');

    // Un exécutable déguisé en JSON est refusé
    await request(app.getHttpServer())
      .post('/uploads?kind=metadata')
      .set('Authorization', `Bearer ${orgToken}`)
      .attach('file', Buffer.from('MZ\x90\x00binaire'), 'meta.json')
      .expect(400);
    await request(app.getHttpServer())
      .post('/uploads?kind=inconnu')
      .set('Authorization', `Bearer ${orgToken}`)
      .attach('file', json, 'meta.json')
      .expect(400);
  });

  it('détecte une réorganisation et retire les événements orphelins', async () => {
    const count = async () => BigInt((await request(app.getHttpServer()).get('/campaigns/0').expect(200)).body.totals.raised);
    await indexer.tick();
    const before = await count();

    const snapshot = (await chain.request({ method: 'evm_snapshot' as any })) as Hex;
    try {
    const { campaigns } = { campaigns: (await request(app.getHttpServer()).get('/campaigns/0')).body };
    const wallet = createWalletClient({ account: account(7), chain: foundry, transport: http(RPC) });
    const usdc = (await import('../src/generated/contracts.js')).deployments[31337].usdc;
    const erc20 = parseAbi(['function approve(address,uint256) returns (bool)']);
    const vaultAbi = parseAbi(['function donate(uint256) returns (uint256)']);
    await chain.waitForTransactionReceipt({
      hash: await wallet.writeContract({ address: usdc, abi: erc20, functionName: 'approve', args: [campaigns.vault, 50_000_000n] }),
    });
    const donated = await chain.waitForTransactionReceipt({
      hash: await wallet.writeContract({ address: campaigns.vault, abi: vaultAbi, functionName: 'donate', args: [50_000_000n] }),
    });
    expect(donated.status).toBe('success');
    await indexer.tick();
    expect(await count()).toBe(before + 50_000_000n);

    // La chaîne « oublie » le don : retour au snapshot puis nouveaux blocs (empreintes différentes)
    } finally {
      await chain.request({ method: 'evm_revert' as any, params: [snapshot] as any });
    }
    await chain.request({ method: 'anvil_mine' as any, params: ['0x4'] as any });
    await indexer.tick();
    expect(await count()).toBe(before);
  });

  it('reconstruction complète : même résultat', async () => {
    const a = (await request(app.getHttpServer()).get('/campaigns')).body;
    await indexer.rebuild();
    const b = (await request(app.getHttpServer()).get('/campaigns')).body;
    expect(b).toEqual(a);
  });
});
