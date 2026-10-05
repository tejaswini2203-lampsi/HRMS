import { Module } from '@nestjs/common';
import { WorkQueueService } from './work-queue.service';
import { WorkQueueController } from './work-queue.controller';
import { ComplianceModule } from '../compliance/compliance.module';
import { LetterModule } from '../letter/letter.module';
import { RequestModule } from '../request/request.module';
import { DocumentModule } from '../document/document.module';

@Module({
  imports: [ComplianceModule, LetterModule, RequestModule, DocumentModule],
  controllers: [WorkQueueController],
  providers: [WorkQueueService],
  exports: [WorkQueueService],
})
export class WorkQueueModule {}
