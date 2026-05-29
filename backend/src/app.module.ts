import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { User } from './entities/user.entity';
import { Employee } from './entities/employee.entity';
import { Account } from './entities/account.entity';
import { Post } from './entities/post.entity';
import { Lead } from './entities/lead.entity';
import { AuthModule } from './modules/auth/auth.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { UsersModule } from './modules/users/users.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { PostsModule } from './modules/posts/posts.module';
import { LeadsModule } from './modules/leads/leads.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { RankingsModule } from './modules/rankings/rankings.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ToolsModule } from './modules/tools/tools.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';

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
        entities: [User, Employee, Account, Post, Lead],
        synchronize: false,
        charset: 'utf8mb4',
      }),
    }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET', 'fallback-secret'),
        signOptions: { expiresIn: config.get('JWT_EXPIRES_IN', '2h') },
      }),
    }),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    AuthModule,
    EmployeesModule,
    UsersModule,
    AccountsModule,
    PostsModule,
    LeadsModule,
    DashboardModule,
    RankingsModule,
    NotificationsModule,
    ToolsModule,
    AnalyticsModule,
  ],
})
export class AppModule {}
