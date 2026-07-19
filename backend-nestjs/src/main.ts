import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import * as express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import compression from 'compression';
import { createCorsOriginValidator } from './common/cors/cors-origin.util';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Security headers. Applied before any route so every response (API and the
  // /queues dashboard) carries them.
  //
  // contentSecurityPolicy is DISABLED on purpose. Helmet's default CSP only
  // permits same-origin scripts/styles with no inline allowance, which breaks
  // the Bull Board dashboard mounted at /queues: its UI injects its own inline
  // bootstrap script and styles, so a default CSP renders a blank page. This is
  // a JSON API with one embedded admin UI (already auth-gated by
  // QueueDashboardAuthMiddleware), not an HTML app serving user content, so a
  // global CSP buys little and would need per-path exceptions to keep /queues
  // working. Disabling it keeps the dashboard functional; the remaining helmet
  // headers (HSTS, X-Content-Type-Options, frameguard, etc.) still apply.
  //
  // crossOriginEmbedderPolicy is left at its helmet default (off). CORP is set
  // to cross-origin so the SPA — which runs on a different tenant subdomain than
  // the API — is never blocked from reading responses; the JSON API itself is
  // already governed by the explicit CORS allowlist below, and helmet does not
  // touch Set-Cookie, so the httpOnly cookie auth is unaffected.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // Response compression (gzip) for all routes. Unrelated to the 50mb JSON body
  // limit below, which bounds inbound request size for base64 image previews.
  app.use(compression());

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
