import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import * as express from 'express';
import cookieParser from 'cookie-parser';
import { createCorsOriginValidator } from './common/cors/cors-origin.util';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Cookie parser — required for httpOnly JWT cookies
  app.use(cookieParser());

  // Increase JSON limit for base64 image previews
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // CORS — allow credentials (cookies) from frontend with strict origin
  // validation. The gate is fail-closed: see `createCorsOriginValidator`.
  app.enableCors({
    origin: createCorsOriginValidator({
      nodeEnv: process.env.NODE_ENV,
      baseDomain: process.env.BASE_DOMAIN || 'odiseo.com',
    }),
    credentials: true,
  });

  // Global Prefix
  app.setGlobalPrefix('api', {
    exclude: ['queues', 'queues/(.*)'],
  });

  // Validation Pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Without this, SIGTERM kills the API process immediately: in-flight requests
  // are dropped and the Postgres pool / Redis connections are never closed, so
  // every rolling deploy costs a burst of user-visible errors and leaks server
  // side connections until they time out. Mirrors `worker.main.ts`.
  app.enableShutdownHooks();

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  Logger.log(`🚀 B2B API running on port ${port}`, 'Bootstrap');
}
bootstrap();
// Rebuild trigger
