import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { User } from './entities/user.entity';
import { Employee } from './entities/employee.entity';
import { Account } from './entities/account.entity';
import { Post } from './entities/post.entity';
import { Lead } from './entities/lead.entity';
import { LeadFollowRecord } from './entities/lead-follow-record.entity';
import { LeadDraft } from './entities/lead-draft.entity';
import { CollaborationTask } from './entities/collaboration-task.entity';
import { Order } from './entities/order.entity';
import { OrderFollowRecord } from './entities/order-follow-record.entity';
import { OrderAbnormalFeedback } from './modules/orders/entities/order-abnormal-feedback.entity';
import { ImportTask } from './entities/import-task.entity';
import { Notification } from './entities/notification.entity';
import { Favorite } from './entities/favorite.entity';
import { PostMetricsHistory } from './entities/post-metrics-history.entity';
import { ExportTask } from './entities/export-task.entity';
import { OperationLog } from './entities/operation-log.entity';
import { AuthModule } from './modules/auth/auth.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { UsersModule } from './modules/users/users.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { PostsModule } from './modules/posts/posts.module';
import { LeadsModule } from './modules/leads/leads.module';
import { LeadDraftsModule } from './modules/lead-drafts/lead-drafts.module';
import { LeadsParserModule } from './modules/leads-parser/leads-parser.module';
import { ImportsModule } from './modules/imports/imports.module';
import { CollaborationTasksModule } from './modules/collaboration-tasks/collaboration-tasks.module';
import { OrdersModule } from './modules/orders/orders.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { RankingsModule } from './modules/rankings/rankings.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { FavoritesModule } from './modules/favorites/favorites.module';
import { ToolsModule } from './modules/tools/tools.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { ExportsModule } from './modules/exports/exports.module';
import { OperationLogsModule } from './modules/operation-logs/operation-logs.module';
import { SupervisorSuggestionsModule } from './modules/supervisor-suggestions/supervisor-suggestions.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { StorageModule } from './shared/storage/storage.service';
import { CacheModule } from './shared/cache.service';
import { FormattedSqlLogger } from './common/sql-logger';
import { JwtAuthMiddleware } from './common/jwt-auth.middleware';
import { TokenRefreshInterceptor } from './common/token-refresh.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env'],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.get('MYSQL_HOST', '127.0.0.1'),
        port: config.get('MYSQL_PORT', 3306),
        username: config.get('MYSQL_USER', 'root'),
        password: config.get('MYSQL_PASSWORD', ''),
        database: config.get('MYSQL_DATABASE', 'lan_dual_role_system'),
        entities: [User, Employee, Account, Post, Lead, LeadFollowRecord, LeadDraft, CollaborationTask, Order, OrderFollowRecord, OrderAbnormalFeedback, ImportTask, Notification, Favorite, PostMetricsHistory, ExportTask, OperationLog],
        synchronize: false,
        charset: 'utf8mb4',
        logging: true,
        logger: new FormattedSqlLogger(),
        extra: {
          connectionLimit: 50,
          waitForConnections: true,
          queueLimit: 0,
          connectTimeout: 10000,
        },
      }),
    }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET', 'fallback-secret'),
        signOptions: { expiresIn: config.get('JWT_EXPIRES_IN', '8h') },
      }),
    }),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ScheduleModule.forRoot(),
    AuthModule,
    EmployeesModule,
    UsersModule,
    AccountsModule,
    PostsModule,
    LeadsModule,
    LeadDraftsModule,
    LeadsParserModule,
    ImportsModule,
    CollaborationTasksModule,
    OrdersModule,
    DashboardModule,
    RankingsModule,
    NotificationsModule,
    FavoritesModule,
    ToolsModule,
    AnalyticsModule,
    ExportsModule,
    OperationLogsModule,
    SupervisorSuggestionsModule,
    UploadsModule,
    StorageModule,
    CacheModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: TokenRefreshInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(JwtAuthMiddleware)
      .forRoutes('*');
  }
}
