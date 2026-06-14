import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TeacherOrderType } from '../../entities/teacher-order-type.entity';
import { Teacher } from '../../entities/teacher.entity';
import { TeacherOrderTypesService } from './teacher-order-types.service';
import { TeacherOrderTypesController } from './teacher-order-types.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TeacherOrderType, Teacher])],
  controllers: [TeacherOrderTypesController],
  providers: [TeacherOrderTypesService],
})
export class TeacherOrderTypesModule {}
