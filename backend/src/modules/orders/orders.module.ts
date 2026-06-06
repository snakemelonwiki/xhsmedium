import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../../entities/order.entity';
import { OrderFollowRecord } from '../../entities/order-follow-record.entity';
import { OrderFinance } from '../../entities/order-finance.entity';
import { Lead } from '../../entities/lead.entity';
import { User } from '../../entities/user.entity';
import { Employee } from '../../entities/employee.entity';
import { OrderAbnormalFeedback } from './entities/order-abnormal-feedback.entity';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { RemindersService } from './reminders.service';
import { OrderAbnormalFeedbackService } from './order-abnormal-feedback.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { OperationLogsModule } from '../operation-logs/operation-logs.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderFollowRecord, OrderFinance, Lead, User, Employee, OrderAbnormalFeedback]),
    NotificationsModule,
    OperationLogsModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService, RemindersService, OrderAbnormalFeedbackService],
  exports: [OrdersService, RemindersService, OrderAbnormalFeedbackService],
})
export class OrdersModule {}
