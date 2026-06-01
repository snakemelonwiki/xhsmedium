import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { Post } from '../../entities/post.entity';
import { Lead } from '../../entities/lead.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Post, Lead])],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
