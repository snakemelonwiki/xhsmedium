import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../../entities/order.entity';
import { OrderFollowRecord } from '../../entities/order-follow-record.entity';
import { Lead } from '../../entities/lead.entity';
import { User } from '../../entities/user.entity';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { RemindersService } from './reminders.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderFollowRecord, Lead, User]),
    NotificationsModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService, RemindersService],
  exports: [OrdersService, RemindersService],
})
export class OrdersModule {}
