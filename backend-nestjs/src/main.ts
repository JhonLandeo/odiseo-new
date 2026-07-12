import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import * as express from 'express';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Cookie parser — required for httpOnly JWT cookies
  app.use(cookieParser());

  // Increase JSON limit for base64 image previews
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // CORS — allow credentials (cookies) from frontend
  app.enableCors({
    origin: true,
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

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  Logger.log(`🚀 B2B API running on port ${port}`, 'Bootstrap');
}
bootstrap();
// Rebuild trigger

