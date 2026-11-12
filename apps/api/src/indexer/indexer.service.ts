import { Inject, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { decodeEventLog, getAbiItem, type Abi, type Address, type Log } from 'viem';
import type pg from 'pg';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { ChainService } from '../chain/chain.service.js';
import { DatabaseService } from '../db/database.service.js';
import { campaignFactoryAbi, donationVaultAbi, milestoneTrackerAbi } from '../generated/contracts.js';

type ContractKind = 'factory' | 'vault' | 'tracker';
const ABIS: Record<ContractKind, Abi> = {
  factory: campaignFactoryAbi as Abi,
  vault: donationVaultAbi as Abi,
  tracker: milestoneTrackerAbi as Abi,
};
const CAMPAIGN_CREATED = getAbiItem({ abi: campaignFactoryAbi, name: 'CampaignCreated' });
/** Profondeur de l'historique d'empreintes conservé pour détecter une réorganisation. */
const REORG_WINDOW = 256n;

/** BigInt -> chaîne, récursivement, pour stocker les arguments d'événements en JSON sans perte. */
function jsonable(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(jsonable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, jsonable(v)]));
  }
  return value;
}

/**
 * Indexeur d'événements vers PostgreSQL (§11). La chaîne reste la source de vérité : la base est
 * reconstructible à tout moment (`pnpm --filter api reindex`), et les réorganisations sont détectées
 * en comparant l'empreinte des blocs indexés à celle de la chaîne.
 */
@Injectable()
export class IndexerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(IndexerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<unknown> | null = null;
  private stopped = false;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(ChainService) private readonly chain: ChainService,
  ) {}

  private get chainId() {
    return this.config.chainId;
  }

  onApplicationBootstrap() {
    if (!this.config.indexerEnabled) return;
    const loop = async () => {
      if (this.stopped) return;
      try {
        this.running = this.tick();
        await this.running;
      } catch (e) {
        this.logger.error(`Indexation interrompue : ${(e as Error).message}`);
      } finally {
        this.running = null;
        if (!this.stopped) this.timer = setTimeout(() => void loop(), this.config.indexerPollMs);
      }
    };
    void loop();
  }

  async onApplicationShutdown() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.running?.catch(() => undefined);
  }

  async lastIndexedBlock(): Promise<bigint> {
    const { rows } = await this.db.query<{ last_block: string }>(
      'select last_block from indexer_state where chain_id = $1',
      [this.chainId],
    );
    return rows[0] ? BigInt(rows[0].last_block) : BigInt(this.config.deployment.startBlock) - 1n;
  }

  /** Une passe : vérifie les réorganisations puis indexe jusqu'au bloc sûr (tête - confirmations). */
  async tick(): Promise<{ from: bigint; to: bigint; events: number } | null> {
    const head = await this.chain.client.getBlockNumber({ cacheTime: 0 });
    const safeHead = head - BigInt(this.config.confirmations);
    const last = await this.handleReorg(await this.lastIndexedBlock());
    if (safeHead <= last) return null;

    const chunk = BigInt(this.config.indexerChunk);
    let events = 0;
    for (let from = last + 1n; from <= safeHead; from += chunk) {
      const to = from + chunk - 1n < safeHead ? from + chunk - 1n : safeHead;
      events += await this.indexRange(from, to);
    }
    return { from: last + 1n, to: safeHead, events };
  }

  /** Reconstruction complète depuis le bloc de déploiement. */
  async rebuild(): Promise<void> {
    await this.db.tx(async (c) => {
      for (const table of ['events', 'campaigns', 'indexed_blocks', 'indexer_state']) {
        await c.query(`delete from ${table} where chain_id = $1`, [this.chainId]);
      }
    });
    this.logger.log('Index effacé, reconstruction depuis le bloc de déploiement…');
    while ((await this.tick()) !== null) {
      /* jusqu'à rattraper la tête */
    }
  }

  /**
   * Si le dernier bloc indexé n'a plus la même empreinte sur la chaîne, remonte jusqu'au dernier bloc commun
   * et supprime tout ce qui a été indexé après lui. Retourne le dernier bloc fiable.
   */
  private async handleReorg(last: bigint): Promise<bigint> {
    const { rows } = await this.db.query<{ number: string; hash: string }>(
      'select number, hash from indexed_blocks where chain_id = $1 and number <= $2 order by number desc limit 64',
      [this.chainId, last.toString()],
    );
    if (rows.length === 0) return last;

    let forkPoint: bigint | null = null;
    for (const row of rows) {
      const block = await this.chain.client.getBlock({ blockNumber: BigInt(row.number) }).catch(() => null);
      if (block?.hash === row.hash) {
        forkPoint = BigInt(row.number);
        break;
      }
    }
    if (forkPoint === last) return last;

    if (forkPoint === null) {
      this.logger.warn('Réorganisation plus profonde que l\'historique conservé : reconstruction complète.');
      forkPoint = BigInt(this.config.deployment.startBlock) - 1n;
    } else {
      this.logger.warn(`Réorganisation détectée : retour au bloc ${forkPoint}.`);
    }
    const fp = forkPoint.toString();
    await this.db.tx(async (c) => {
      await c.query('delete from events where chain_id = $1 and block_number > $2', [this.chainId, fp]);
      await c.query('delete from campaigns where chain_id = $1 and block_number > $2', [this.chainId, fp]);
      await c.query('delete from indexed_blocks where chain_id = $1 and number > $2', [this.chainId, fp]);
      await this.setLast(c, forkPoint);
    });
    return forkPoint;
  }

  private async setLast(c: pg.PoolClient, block: bigint) {
    await c.query(
      `insert into indexer_state (chain_id, last_block) values ($1, $2)
       on conflict (chain_id) do update set last_block = excluded.last_block`,
      [this.chainId, block.toString()],
    );
  }

  private async indexRange(from: bigint, to: bigint): Promise<number> {
    const client = this.chain.client;
    const factory = this.config.deployment.factory;

    // 1. Nouvelles campagnes : elles révèlent les adresses des coffres et trackers à suivre
    const created = await client.getLogs({ address: factory, event: CAMPAIGN_CREATED, fromBlock: from, toBlock: to });

    // 2. Carte adresse -> (type de contrat, campagne), y compris les campagnes créées dans cette plage
    const { rows: known } = await this.db.query<{ campaign_id: number; vault: string; tracker: string }>(
      'select campaign_id, vault, tracker from campaigns where chain_id = $1',
      [this.chainId],
    );
    const contracts = new Map<string, { kind: ContractKind; campaignId: number | null }>();
    contracts.set(factory.toLowerCase(), { kind: 'factory', campaignId: null });
    for (const c of known) {
      contracts.set(c.vault, { kind: 'vault', campaignId: c.campaign_id });
      contracts.set(c.tracker, { kind: 'tracker', campaignId: c.campaign_id });
    }
    for (const log of created) {
      const id = Number(log.args.campaignId);
      contracts.set(log.args.vault!.toLowerCase(), { kind: 'vault', campaignId: id });
      contracts.set(log.args.tracker!.toLowerCase(), { kind: 'tracker', campaignId: id });
    }

    // 3. Tous les événements des contrats suivis
    const logs: Log[] = await client.getLogs({
      address: [...contracts.keys()] as Address[],
      fromBlock: from,
      toBlock: to,
    });

    // 4. Horodatage et empreinte de chaque bloc concerné, plus celle du dernier bloc (ancre anti-réorg)
    const blockNumbers = new Set<bigint>(logs.map((l) => l.blockNumber!));
    blockNumbers.add(to);
    const blocks = new Map<bigint, { hash: string; time: bigint }>();
    await Promise.all(
      [...blockNumbers].map(async (n) => {
        const b = await client.getBlock({ blockNumber: n });
        blocks.set(n, { hash: b.hash!, time: b.timestamp });
      }),
    );

    await this.db.tx(async (c) => {
      for (const log of created) {
        const a = log.args;
        await c.query(
          `insert into campaigns (chain_id, campaign_id, org, vault, tracker, metadata_uri, soft_cap, hard_cap,
             funding_deadline, block_number, tx_hash)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) on conflict do nothing`,
          [
            this.chainId,
            Number(a.campaignId),
            a.org!.toLowerCase(),
            a.vault!.toLowerCase(),
            a.tracker!.toLowerCase(),
            a.metadataURI,
            a.softCap!.toString(),
            a.hardCap!.toString(),
            a.fundingDeadline!.toString(),
            log.blockNumber!.toString(),
            log.transactionHash,
          ],
        );
      }

      for (const log of logs) {
        const target = contracts.get(log.address.toLowerCase());
        if (!target) continue;
        let decoded: { eventName: string; args: unknown };
        try {
          decoded = decodeEventLog({ abi: ABIS[target.kind], data: log.data, topics: log.topics }) as typeof decoded;
        } catch {
          continue; // événement d'un contrat hérité non décrit (ex. Initialized) : ignoré
        }
        const block = blocks.get(log.blockNumber!)!;
        await c.query(
          `insert into events (chain_id, block_number, block_hash, block_time, tx_hash, log_index, address, contract,
             campaign_id, event_name, args)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) on conflict do nothing`,
          [
            this.chainId,
            log.blockNumber!.toString(),
            log.blockHash,
            block.time.toString(),
            log.transactionHash,
            log.logIndex,
            log.address.toLowerCase(),
            target.kind,
            target.campaignId,
            decoded.eventName,
            JSON.stringify(jsonable(decoded.args ?? {})),
          ],
        );
      }

      for (const [n, b] of blocks) {
        await c.query(
          `insert into indexed_blocks (chain_id, number, hash) values ($1,$2,$3)
           on conflict (chain_id, number) do update set hash = excluded.hash`,
          [this.chainId, n.toString(), b.hash],
        );
      }
      await c.query('delete from indexed_blocks where chain_id = $1 and number < $2', [
        this.chainId,
        (to - REORG_WINDOW).toString(),
      ]);
      await this.setLast(c, to);
    });

    if (logs.length > 0) this.logger.log(`Blocs ${from}–${to} : ${logs.length} événement(s) indexé(s).`);
    return logs.length;
  }
}
