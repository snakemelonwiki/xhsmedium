import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Post } from '../../entities/post.entity';
import { Lead } from '../../entities/lead.entity';
import { PostMetricsHistory } from '../../entities/post-metrics-history.entity';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { PostsMetricsService } from './posts-metrics.service';

@Module({
  imports: [TypeOrmModule.forFeature([Post, Lead, PostMetricsHistory])],
  controllers: [PostsController],
  providers: [PostsService, PostsMetricsService],
  exports: [PostsService, PostsMetricsService],
})
export class PostsModule {}
