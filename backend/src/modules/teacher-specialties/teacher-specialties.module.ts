import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TeacherSpecialty } from '../../entities/teacher-specialty.entity';
import { Teacher } from '../../entities/teacher.entity';
import { TeacherSpecialtiesService } from './teacher-specialties.service';
import { TeacherSpecialtiesController } from './teacher-specialties.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TeacherSpecialty, Teacher])],
  controllers: [TeacherSpecialtiesController],
  providers: [TeacherSpecialtiesService],
})
export class TeacherSpecialtiesModule {}
