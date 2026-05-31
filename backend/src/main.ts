import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import * as path from 'path';

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

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');

  // HTTP request logger
  app.use(requestLogger);

	  app.enableCors({
	    origin: true,
	    credentials: true,
	    exposedHeaders: ['X-New-Token'],
	  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: false,
      transform: true,
    }),
  );

  const expressApp = app.getHttpAdapter().getInstance();

  // Body size limits
  expressApp.use((req: any, _res: any, next: any) => {
    const limit = 10 * 1024 * 1024;
    let received = 0;
    req.on('data', (chunk: Buffer) => {
      received += chunk.length;
      if (received > limit) {
        req.destroy(new Error('Request entity too large'));
      }
    });
    next();
  });

  // Static file serving
  const expressStatic = require('express').static;
  const publicDir = path.join(__dirname, '..', '..', 'public');
  const uploadsDir = path.join(__dirname, '..', '..', 'uploads');

  expressApp.use('/uploads', expressStatic(uploadsDir));
  expressApp.use(expressStatic(publicDir, { index: ['index.html'] }));

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`运营中台已启动: http://0.0.0.0:${port}`);
}
bootstrap();
