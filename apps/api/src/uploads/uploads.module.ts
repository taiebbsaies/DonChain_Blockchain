import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PinningService } from './pinning.service.js';
import { UploadsController } from './uploads.controller.js';
import { UploadsService } from './uploads.service.js';

@Module({
  imports: [AuthModule],
  controllers: [UploadsController],
  providers: [UploadsService, PinningService],
})
export class UploadsModule {}
