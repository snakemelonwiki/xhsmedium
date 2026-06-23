import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderPayment } from '../../entities/order-payment.entity';
import { TeacherPayment } from '../../entities/teacher-payment.entity';
import { OtherExpense } from '../../entities/other-expense.entity';
import { OrderFinance } from '../../entities/order-finance.entity';
import { Order } from '../../entities/order.entity';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { OperationLogsModule } from '../operation-logs/operation-logs.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([OrderPayment, TeacherPayment, OtherExpense, OrderFinance, Order]),
    OperationLogsModule,
  ],
  controllers: [FinanceController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
