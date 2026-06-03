import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SupervisorSuggestion } from '../../entities/supervisor-suggestion.entity';
import { Post } from '../../entities/post.entity';
import { Account } from '../../entities/account.entity';
import { Employee } from '../../entities/employee.entity';
import { User } from '../../entities/user.entity';
import { SupervisorSuggestionsController } from './supervisor-suggestions.controller';
import { SupervisorSuggestionsService } from './supervisor-suggestions.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SupervisorSuggestion, Post, Account, Employee, User]),
    NotificationsModule,
  ],
  controllers: [SupervisorSuggestionsController],
  providers: [SupervisorSuggestionsService],
  exports: [SupervisorSuggestionsService],
})
export class SupervisorSuggestionsModule {}
