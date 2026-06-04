import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Employee } from '../../entities/employee.entity';
import { User } from '../../entities/user.entity';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { OperationLogsModule } from '../operation-logs/operation-logs.module';

@Module({
  // B 端 1.2 P0-A5 修复：注册 User 实体，
  // 使 EmployeesService 可通过 @InjectRepository(User) 完成登录账号的双向绑定。
  imports: [TypeOrmModule.forFeature([Employee, User]), OperationLogsModule],
  controllers: [EmployeesController],
  providers: [EmployeesService],
  exports: [EmployeesService],
})
export class EmployeesModule {}
