import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import * as path from 'path';
import { createBodySizeGuard } from './common/body-size.middleware';
import { AuthGuard } from './common/auth.guard';
import { AuthService } from './modules/auth/auth.service';

// HTTP request logger
function requestLogger(req: any, res: any, next: any) {
  const start = Date.now();

  // 打印请求信息
  console.log(`\n\x1b[36m[${new Date().toISOString()}] ${req.method} ${req.originalUrl}\x1b[0m`);
  if (Object.keys(req.query).length) {
    console.log('\x1b[33m[QUERY]\x1b[0m', JSON.stringify(req.query));
  }
  if (req.body && Object.keys(req.body).length) {
    console.log('\x1b[33m[BODY]\x1b[0m', JSON.stringify(req.body));
  }

  // 拦截响应
  const originalJson = res.json;
  res.json = function(data: any) {
    const elapsed = Date.now() - start;
    console.log(`\x1b[32m[RESPONSE]\x1b[0m ${res.statusCode} (${elapsed}ms)`);
    console.log('\x1b[32m[DATA]\x1b[0m', JSON.stringify(data).substring(0, 500));
    return originalJson.call(this, data);
  };

  next();
}

// Process-level safety net: never let a single un-awaited error take down the
// whole API. Without this an unhandled promise rejection (e.g. QueryFailedError
// surfaced from an async controller or a Playwright timeout) terminates the
// Node process and the port goes silent.
process.on('unhandledRejection', (reason: any) => {
  console.error('\x1b[31m[unhandledRejection]\x1b[0m', reason?.stack || reason);
});
process.on('uncaughtException', (err: Error) => {
  console.error('\x1b[31m[uncaughtException]\x1b[0m', err?.stack || err);
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 注入 AuthGuard 依赖（避免子模块未 import JwtModule 导致 DI 失败）
  // B7 修复（2026-06-03）：多传一个 ConfigService，让 AuthGuard 知道当前
  // 进程对应的 PORT / OWNER_PORT，用于路由级 port-role 二次校验。
  // PF-05 修复（2026-06-04）：再传 AuthService.isTokenRevoked 函数，
  //   AuthGuard 在 JWT verify 通过后异步调它来查 revoked_tokens 表。
  const authService = app.get(AuthService);
  AuthGuard.configure(
    app.get(JwtService),
    app.get(Reflector),
    app.get(ConfigService),
    (token: string) => authService.isTokenRevoked(token),
  );

  app.setGlobalPrefix('api');

  // B7 兜底：如果请求没带 x-server-port（说明没经过 server.js proxy，
  // 例如本地 8089 直连 / 测试），用 process.env.PORT 兜底，AuthGuard 据此
  // 判断是主入口还是 owner 端口。
  // v1.3：同步支持 ALL_ROLES_PORT（3003 统一登录入口）的兜底；process.env.PORT
  // 是 NestJS 进程自己的 8089，所以全部三个端口的「缺省透传」都走 8089。
  const selfServerPort = String(Number(process.env.PORT ?? 3000) || 3000);
  app.use((req: any, _res: any, next: any) => {
    if (!req.headers['x-server-port']) {
      req.headers['x-server-port'] = selfServerPort;
    }
    if (!req.headers['x-origin-port']) {
      req.headers['x-origin-port'] = selfServerPort;
    }
    next();
  });

  // HTTP request logger
  app.use(requestLogger);

	  app.enableCors({
	    origin: true,
	    credentials: true,
	    exposedHeaders: ['X-New-Token'],
	  });

  // 全局字符集设置 - 确保 JSON 响应使用 UTF-8
  app.use((req: any, res: any, next: any) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    next();
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: false,
      transform: true,
    }),
  );

  const expressApp = app.getHttpAdapter().getInstance();

  // 显式配置 JSON 解析器支持 UTF-8 编码
  const bodyParser = require('body-parser');
  expressApp.use(bodyParser.json({ limit: '10mb', type: 'application/json' }));
  expressApp.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

  // Body size limits. Multipart uploads are parsed by Multer and must not be
  // read here, otherwise the request stream reaches Multer incomplete.
  expressApp.use(createBodySizeGuard(10 * 1024 * 1024));

  // Static file serving
  const expressStatic = require('express').static;
  const publicDir = path.join(__dirname, '..', '..', 'public');
  const uploadsDir = path.join(__dirname, '..', '..', 'uploads');

  expressApp.use('/uploads', expressStatic(uploadsDir));
  expressApp.use(expressStatic(publicDir, { index: ['index.html'] }));

  const port = Number(process.env.PORT ?? 8089);
  await app.listen(port);
  console.log(`运营中台已启动: http://0.0.0.0:${port}`);
}
bootstrap();
