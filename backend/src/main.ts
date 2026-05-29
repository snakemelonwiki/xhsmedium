import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import * as path from 'path';

// HTTP request logger
function requestLogger(req: any, _res: any, next: any) {
  const start = Date.now();
  const originalEnd = _res.end;
  _res.end = function(...args: any[]) {
    const elapsed = Date.now() - start;
    console.log(`${req.method} ${req.originalUrl} -> ${_res.statusCode} (${elapsed}ms)`);
    originalEnd.apply(_res, args);
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
