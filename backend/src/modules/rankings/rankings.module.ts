import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Post } from '../../entities/post.entity';
import { Lead } from '../../entities/lead.entity';
import { RankingsController } from './rankings.controller';
import { RankingsService } from './rankings.service';
import { DashboardModule } from '../dashboard/dashboard.module';
import { PostsModule } from '../posts/posts.module';
import { LeadsModule } from '../leads/leads.module';

@Module({
  imports: [TypeOrmModule.forFeature([Post, Lead]), DashboardModule, PostsModule, LeadsModule],
  controllers: [RankingsController],
  providers: [RankingsService],
  exports: [RankingsService],
})
export class RankingsModule {}
