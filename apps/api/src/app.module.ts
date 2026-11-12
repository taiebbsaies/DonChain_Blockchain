import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { AuthModule } from './auth/auth.module.js';
import { ChainModule } from './chain/chain.module.js';
import { APP_CONFIG, loadConfig } from './config.js';
import { DatabaseModule } from './db/database.module.js';
import { ExplorerModule } from './explorer/explorer.module.js';
import { IndexerModule } from './indexer/indexer.module.js';
import { UploadsModule } from './uploads/uploads.module.js';

@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: () => loadConfig() }],
  exports: [APP_CONFIG],
})
class AppConfigModule {}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }), // charge .env
    AppConfigModule,
    // Limitation de débit globale ; plus stricte sur l'authentification et les téléversements
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    DatabaseModule,
    ChainModule,
    AuthModule,
    UploadsModule,
    IndexerModule,
    ExplorerModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
