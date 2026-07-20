import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { Logger as PinoLogger } from 'nestjs-pino';
import * as express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import compression from 'compression';
import { createCorsOriginValidator } from './common/cors/cors-origin.util';

async function bootstrap() {
  // `bufferLogs: true` queues every log emitted during bootstrap (before
  // `app.useLogger` below attaches the real, pino-backed logger) instead of
  // dropping it — otherwise everything logged while the DI container is
  // still assembling (including this file's own `Logger.log` calls above the
  // `useLogger` line) would be lost. If `NestFactory.create` itself throws
  // (a bootstrap-time crash), Nest flushes that buffer through its DEFAULT
  // console logger, not pino — `useLogger` never got the chance to attach —
  // so a startup failure prints one unstructured console line while every
  // other log in the system is JSON. Accepted: fully avoiding it would mean
  // configuring pino before the DI container exists at all, which is a much
  // bigger change for a narrow, already-loud (the process exits) window.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // From this line on, every `new Logger(ClassName.name)` call site across
  // the app (~40+ of them, unchanged) — plus the `Logger.log` calls in this
  // file — emit through nestjs-pino instead of Nest's default console
  // logger. `app.get(PinoLogger)` resolves nestjs-pino's own `Logger` class
  // (aliased on import — @nestjs/common already owns the name `Logger` in
  // this file), which LoggerModule.forRootAsync registered in app.module.ts.
  app.useLogger(app.get(PinoLogger));

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
  // 'metrics' is excluded for the same reason 'queues' is: a Prometheus
  // scrape config defaults to `metrics_path: /metrics`, so the route needs to
  // sit outside the versioned /api surface rather than repointing every
  // deploy's scrape config to /api/metrics.
  app.setGlobalPrefix('api', {
    exclude: ['queues', 'queues/(.*)', 'metrics'],
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
