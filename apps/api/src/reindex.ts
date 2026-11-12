import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { IndexerService } from './indexer/indexer.service.js';

// Reconstruction complète de l'index depuis la chaîne : `pnpm --filter api reindex`
process.env.INDEXER_ENABLED = 'false';
const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'warn', 'error'] });
await app.get(IndexerService).rebuild();
await app.close();
