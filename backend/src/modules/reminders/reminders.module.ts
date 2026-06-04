import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Notification } from '../../entities/notification.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { RemindersController } from './reminders.controller';
import { RemindersService } from './reminders.service';

/**
 * v1.3 CROSS-3 通用提醒模块。
 * 复用 NotificationsService 写 notifications 表 + Socket.IO 推送。
 */
@Module({
  imports: [TypeOrmModule.forFeature([Notification]), NotificationsModule],
  controllers: [RemindersController],
  providers: [RemindersService],
  exports: [RemindersService],
})
export class RemindersModule {}
