import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExportTask } from '../../entities/export-task.entity';
import { Lead } from '../../entities/lead.entity';
import { Order } from '../../entities/order.entity';
import { CollaborationTask } from '../../entities/collaboration-task.entity';
import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ExportTask, Lead, Order, CollaborationTask]),
    NotificationsModule,
  ],
  controllers: [ExportsController],
  providers: [ExportsService],
  exports: [ExportsService],
})
export class ExportsModule {}
