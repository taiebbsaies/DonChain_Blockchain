import { Module } from '@nestjs/common';
import { ExplorerController } from './explorer.controller.js';
import { ExplorerService } from './explorer.service.js';

@Module({ controllers: [ExplorerController], providers: [ExplorerService], exports: [ExplorerService] })
export class ExplorerModule {}
