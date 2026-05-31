import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Lead } from '../../entities/lead.entity';
import { LeadFollowRecord } from '../../entities/lead-follow-record.entity';
import { Post } from '../../entities/post.entity';
import { Account } from '../../entities/account.entity';
import { User } from '../../entities/user.entity';
import { CollaborationTask } from '../../entities/collaboration-task.entity';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { CollaborationTasksModule } from '../collaboration-tasks/collaboration-tasks.module';
import { OperationLogsModule } from '../operation-logs/operation-logs.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Lead, LeadFollowRecord, Post, Account, User, CollaborationTask]),
    NotificationsModule,
    CollaborationTasksModule,
    OperationLogsModule,
  ],
  controllers: [LeadsController],
  providers: [LeadsService],
  exports: [LeadsService],
})
export class LeadsModule {}
