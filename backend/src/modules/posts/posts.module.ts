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
// T8/T9: 作品广场门槛配置
import { PlazaConfigModule } from '../plaza-config/plaza-config.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Post, Lead, PostMetricsHistory, PostMetrics]),
    OperationLogsModule,
    ParserModule,
    FavoritesModule,
    PlazaConfigModule,
  ],
  controllers: [PostsController],
  providers: [PostsService, PostsMetricsService],
  exports: [PostsService, PostsMetricsService],
})
export class PostsModule {}
