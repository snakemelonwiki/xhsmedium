import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImportTask } from '../../entities/import-task.entity';
import { Lead } from '../../entities/lead.entity';
import { Post } from '../../entities/post.entity';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';
import { ImportsProcessor } from './imports.processor';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ImportTask, Lead, Post]),
    NotificationsModule,
  ],
  controllers: [ImportsController],
  // ImportsProcessor 同 module 注册：DI 拉起后由其 onModuleInit 启动 bullmq Worker。
  // 与 exports 模块对齐：直接用 bullmq Queue，不引入 @nestjs/bull（与项目其它模块一致）。
  providers: [ImportsService, ImportsProcessor],
  exports: [ImportsService],
})
export class ImportsModule {}
