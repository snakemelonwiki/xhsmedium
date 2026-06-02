import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExportTask } from '../../entities/export-task.entity';
import { Lead } from '../../entities/lead.entity';
import { Order } from '../../entities/order.entity';
import { OrderFollowRecord } from '../../entities/order-follow-record.entity';
import { User } from '../../entities/user.entity';
import { CollaborationTask } from '../../entities/collaboration-task.entity';
import { Post } from '../../entities/post.entity';
import { Account } from '../../entities/account.entity';
import { Employee } from '../../entities/employee.entity';
import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';
import { ExportsProcessor } from './exports.processor';
import { NotificationsModule } from '../notifications/notifications.module';
import { OperationLogsModule } from '../operation-logs/operation-logs.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ExportTask,
      Lead,
      Order,
      OrderFollowRecord,
      User,
      CollaborationTask,
      Post,
      Account,
      Employee,
    ]),
    NotificationsModule,
    OperationLogsModule,
  ],
  controllers: [ExportsController],
  // ExportsProcessor 同 module 注册：DI 拉起后由其 onModuleInit 启动 bullmq Worker。
  // 旧 v1.1 行为（setImmediate）保留为 fallback，对 REDIS_URL 未配置的本地 / 演示环境零影响。
  providers: [ExportsService, ExportsProcessor],
  exports: [ExportsService],
})
export class ExportsModule {}
