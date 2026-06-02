import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeadDraft } from '../../entities/lead-draft.entity';
import { LeadDraftsController } from './lead-drafts.controller';
import { LeadDraftsService } from './lead-drafts.service';
import { OperationLogsModule } from '../operation-logs/operation-logs.module';

@Module({
  imports: [TypeOrmModule.forFeature([LeadDraft]), OperationLogsModule],
  controllers: [LeadDraftsController],
  providers: [LeadDraftsService],
  exports: [LeadDraftsService],
})
export class LeadDraftsModule {}
