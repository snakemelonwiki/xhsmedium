import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Lead } from '../../entities/lead.entity';
import { Order } from '../../entities/order.entity';
import { User } from '../../entities/user.entity';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { LeadsModule } from '../leads/leads.module';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Lead, Order, User]),
    LeadsModule,
    OrdersModule,
  ],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
