import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
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
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  app.enableShutdownHooks();
  Logger.log('🛠️  Materials worker running (queue processing, no HTTP)', 'WorkerBootstrap');
}

bootstrap();
