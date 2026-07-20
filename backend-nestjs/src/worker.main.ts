import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { Logger as PinoLogger } from 'nestjs-pino';
import { AppModule } from './app.module';

/**
 * Worker entrypoint — runs the BullMQ job processors WITHOUT an HTTP server.
 *
 * This enforces the architectural invariant "heavy compute (headless-browser
 * PDF render) runs outside the process that serves the API". Deploy this as a
 * separate process/replica set from the API:
 *   - API replicas:    PROCESS_ROLE=api    node dist/main
 *   - Worker replicas:  PROCESS_ROLE=worker node dist/worker.main
 *
 * `createApplicationContext` boots the DI container (so the queue processor
 * consumes jobs) but never opens an HTTP port. Shutdown hooks ensure the shared
 * Chromium browser is closed cleanly on SIGTERM.
 */
async function bootstrap() {
  // `createApplicationContext` (unlike `NestFactory.create`) never
  // instantiates Nest's `MiddlewareModule`, so no module's `configure()` ever
  // runs here — confirmed against @nestjs/core's source, where
  // `middlewareModule` is wired up in `NestApplication.init()`, not in the
  // `NestApplicationContext` base class this returns. Concretely: neither
  // nestjs-cls's CLS-establishing middleware nor pino-http's
  // request-logging/timing middleware ever run in this process, which is
  // fine — there is no HTTP request here to correlate or time. What DOES
  // still work is the `Logger` PROVIDER nestjs-pino registers (a plain DI
  // provider, unrelated to the middleware), which is all `useLogger` below
  // needs: every `new Logger(ClassName.name)` call a queue processor makes
  // still emits structured JSON through pino, just without a `requestId`
  // field (there is no request-scoped CLS context to read one from).
  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(PinoLogger));
  app.enableShutdownHooks();
  Logger.log(
    '🛠️  Materials worker running (queue processing, no HTTP)',
    'WorkerBootstrap',
  );
}

bootstrap();
