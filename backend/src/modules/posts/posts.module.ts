import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Post } from '../../entities/post.entity';
import { PostMetricsHistory } from '../../entities/post-metrics-history.entity';
import { Favorite } from '../../entities/favorite.entity';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { PostsMetricsService } from './posts-metrics.service';

@Module({
  imports: [TypeOrmModule.forFeature([Post, PostMetricsHistory, Favorite])],
  controllers: [PostsController],
  providers: [PostsService, PostsMetricsService],
  exports: [PostsService, PostsMetricsService],
})
export class PostsModule {}
