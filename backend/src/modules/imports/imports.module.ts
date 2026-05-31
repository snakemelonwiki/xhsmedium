import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImportTask } from '../../entities/import-task.entity';
import { Lead } from '../../entities/lead.entity';
import { Post } from '../../entities/post.entity';
import { Account } from '../../entities/account.entity';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';
import { PostsBulkImportService } from './posts-bulk-import.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ImportTask, Lead, Post, Account]),
    NotificationsModule,
  ],
  controllers: [ImportsController],
  providers: [ImportsService, PostsBulkImportService],
  exports: [ImportsService, PostsBulkImportService],
})
export class ImportsModule {}
