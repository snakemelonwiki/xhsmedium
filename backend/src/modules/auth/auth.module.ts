import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../entities/user.entity';
import { Employee } from '../../entities/employee.entity';
import { RevokedToken } from './entities/revoked-token.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OperationLogsModule } from '../operation-logs/operation-logs.module';

@Module({
  imports: [TypeOrmModule.forFeature([User, Employee, RevokedToken]), OperationLogsModule],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
