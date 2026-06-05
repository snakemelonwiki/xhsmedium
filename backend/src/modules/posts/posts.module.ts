import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Post } from '../../entities/post.entity';
import { Lead } from '../../entities/lead.entity';
import { PostMetricsHistory } from '../../entities/post-metrics-history.entity';
import { PostMetrics } from '../../entities/post-metrics.entity';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { PostsMetricsService } from './posts-metrics.service';
import { OperationLogsModule } from '../operation-logs/operation-logs.module';
import { ParserModule } from '../parser/parser.module';
import { FavoritesModule } from '../favorites/favorites.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Post, Lead, PostMetricsHistory, PostMetrics]),
    OperationLogsModule,
    ParserModule,
    FavoritesModule,
  ],
  controllers: [PostsController],
  providers: [PostsService, PostsMetricsService],
  exports: [PostsService, PostsMetricsService],
})
export class PostsModule {}
