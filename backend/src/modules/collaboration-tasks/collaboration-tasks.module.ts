import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CollaborationTask } from '../../entities/collaboration-task.entity';
import { Lead } from '../../entities/lead.entity';
import { User } from '../../entities/user.entity';
import { CollaborationTasksController } from './collaboration-tasks.controller';
import { CollaborationTasksService } from './collaboration-tasks.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CollaborationTask, Lead, User]),
    NotificationsModule,
  ],
  controllers: [CollaborationTasksController],
  providers: [CollaborationTasksService],
  exports: [CollaborationTasksService],
})
export class CollaborationTasksModule {}
