import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import pg from 'pg';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { MIGRATIONS } from './migrations.js';

// Les numeric(78) (montants uint256) restent des chaînes : jamais de perte de précision.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => v);

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  readonly pool: pg.Pool;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });
  }

  async onModuleInit() {
    await this.migrate();
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  query<T extends pg.QueryResultRow = any>(text: string, params: unknown[] = []) {
    return this.pool.query<T>(text, params);
  }

  /** Exécute `fn` dans une transaction (validée si `fn` réussit, annulée sinon). */
  async tx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const result = await fn(client);
      await client.query('commit');
      return result;
    } catch (e) {
      await client.query('rollback');
      throw e;
    } finally {
      client.release();
    }
  }

  private async migrate() {
    await this.tx(async (c) => {
      // Verrou consultatif : plusieurs instances peuvent démarrer en même temps
      await c.query('select pg_advisory_xact_lock(4242001)');
      await c.query('create table if not exists schema_migrations (id text primary key, applied_at timestamptz not null default now())');
      const { rows } = await c.query<{ id: string }>('select id from schema_migrations');
      const done = new Set(rows.map((r) => r.id));
      for (const m of MIGRATIONS) {
        if (done.has(m.id)) continue;
        await c.query(m.sql);
        await c.query('insert into schema_migrations (id) values ($1)', [m.id]);
        this.logger.log(`Migration appliquée : ${m.id}`);
      }
    });
  }
}
