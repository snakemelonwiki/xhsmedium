import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SupervisorSuggestion } from '../../entities/supervisor-suggestion.entity';
import { SupervisorSuggestionsService } from './supervisor-suggestions.service';
import { SupervisorSuggestionsController } from './supervisor-suggestions.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { OperationLogsModule } from '../operation-logs/operation-logs.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SupervisorSuggestion]),
    NotificationsModule,
    OperationLogsModule,
  ],
  controllers: [SupervisorSuggestionsController],
  providers: [SupervisorSuggestionsService],
  exports: [SupervisorSuggestionsService],
})
export class SupervisorSuggestionsModule {}
