import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { DatabaseService } from '../db/database.service.js';
import { toFlowRow, type EventRow, type FlowRow } from './flows.js';

export type CampaignView = {
  id: number;
  org: string;
  vault: string;
  tracker: string;
  metadataURI: string;
  softCap: string;
  hardCap: string;
  fundingDeadline: number;
  createdBlock: number;
  totals: { raised: string; released: string; refunded: string; inEscrow: string };
  donors: number;
  milestones: number;
  disputes: number;
};

@Injectable()
export class ExplorerService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}

  private readonly campaignSql = `
    select c.*,
      coalesce(sum((e.args->>'amount')::numeric) filter (where e.event_name = 'DonationReceived'), 0)::text as raised,
      coalesce(sum((e.args->>'amount')::numeric) filter (where e.event_name = 'FundsReleased'), 0)::text as released,
      coalesce(sum((e.args->>'amount')::numeric) filter (where e.event_name = 'RefundIssued'), 0)::text as refunded,
      count(distinct e.args->>'donor') filter (where e.event_name = 'DonationReceived')::int as donors,
      count(*) filter (where e.event_name = 'MilestoneCreated')::int as milestones,
      count(*) filter (where e.event_name = 'DisputeOpened')::int as disputes
    from campaigns c
    left join events e on e.chain_id = c.chain_id and e.campaign_id = c.campaign_id
    where c.chain_id = $1`;

  private toView(r: any): CampaignView {
    const inEscrow = BigInt(r.raised) - BigInt(r.released) - BigInt(r.refunded);
    return {
      id: r.campaign_id,
      org: r.org,
      vault: r.vault,
      tracker: r.tracker,
      metadataURI: r.metadata_uri,
      softCap: r.soft_cap,
      hardCap: r.hard_cap,
      fundingDeadline: Number(r.funding_deadline),
      createdBlock: Number(r.block_number),
      totals: { raised: r.raised, released: r.released, refunded: r.refunded, inEscrow: inEscrow.toString() },
      donors: r.donors,
      milestones: r.milestones,
      disputes: r.disputes,
    };
  }

  async list(): Promise<CampaignView[]> {
    const { rows } = await this.db.query(
      `${this.campaignSql} group by c.chain_id, c.campaign_id order by c.campaign_id desc`,
      [this.config.chainId],
    );
    return rows.map((r) => this.toView(r));
  }

  async get(id: number): Promise<CampaignView> {
    const { rows } = await this.db.query(
      `${this.campaignSql} and c.campaign_id = $2 group by c.chain_id, c.campaign_id`,
      [this.config.chainId, id],
    );
    if (!rows[0]) throw new NotFoundException('Campagne inconnue (ou pas encore indexée).');
    return this.toView(rows[0]);
  }

  async flows(id: number): Promise<FlowRow[]> {
    await this.get(id);
    const { rows } = await this.db.query<EventRow>(
      `select block_number, block_time, tx_hash, log_index, contract, event_name, args
       from events where chain_id = $1 and campaign_id = $2 order by block_number, log_index`,
      [this.config.chainId, id],
    );
    // L'événement CampaignCreated est émis par la fabrique avant que la campagne ne soit connue
    const { rows: created } = await this.db.query<EventRow>(
      `select block_number, block_time, tx_hash, log_index, contract, event_name, args from events
       where chain_id = $1 and contract = 'factory' and event_name = 'CampaignCreated' and (args->>'campaignId')::int = $2`,
      [this.config.chainId, id],
    );
    return [...created, ...rows].map(toFlowRow).filter((r): r is FlowRow => r !== null);
  }

  async status() {
    const { rows } = await this.db.query<{ last_block: string }>(
      'select last_block from indexer_state where chain_id = $1',
      [this.config.chainId],
    );
    return { chainId: this.config.chainId, indexedBlock: rows[0] ? Number(rows[0].last_block) : null };
  }
}
