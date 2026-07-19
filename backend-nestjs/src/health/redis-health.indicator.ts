import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  HealthIndicatorResult,
  HealthIndicatorService,
} from '@nestjs/terminus';
import Redis from 'ioredis';

/**
 * Readiness indicator for Redis.
 *
 * Owns a dedicated ioredis client (separate from the throttler / locking
 * clients) configured to fail fast: a readiness probe must answer quickly and
 * report "down" rather than hang while Redis is unreachable. `enableOfflineQueue
 * = false` and `maxRetriesPerRequest = 1` stop commands from queuing against a
 * dead connection, and the PING itself is additionally bounded by
 * `PING_TIMEOUT_MS` so a half-open socket can never stall the probe.
 */
@Injectable()
export class RedisHealthIndicator implements OnModuleDestroy {
  private readonly logger = new Logger(RedisHealthIndicator.name);
  private readonly client: Redis;

  /** Hard ceiling on the PING round-trip; the probe reports "down" past this. */
  private static readonly PING_TIMEOUT_MS = 2000;

  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    config: ConfigService,
  ) {
    const host = config.get<string>('REDIS_HOST') || 'localhost';
    const port = parseInt(config.get<string>('REDIS_PORT') || '6379', 10);
    this.client = new Redis({
      host,
      port,
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: RedisHealthIndicator.PING_TIMEOUT_MS,
      // Keep trying to reconnect so readiness recovers on its own once Redis is
      // back, without restarting the process.
      retryStrategy: (times) => Math.min(times * 200, 2000),
    });
    // ioredis emits 'error' on every failed (re)connect; without a listener that
    // would crash the process. The probe surfaces the failure via down() below,
    // so this handler only prevents the crash.
    this.client.on('error', () => undefined);
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(key);
    try {
      await this.ping();
      return indicator.up();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Redis readiness check failed: ${message}`);
      return indicator.down({ message });
    }
  }

  /**
   * ioredis' own timeouts cover the connect/command layer, but a socket that is
   * open yet unresponsive can still outlive them; racing an explicit timer
   * guarantees the probe settles within PING_TIMEOUT_MS regardless.
   */
  private async ping(): Promise<void> {
    let timer: NodeJS.Timeout;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error(
              `Redis PING timed out after ${RedisHealthIndicator.PING_TIMEOUT_MS}ms`,
            ),
          ),
        RedisHealthIndicator.PING_TIMEOUT_MS,
      );
    });

    try {
      await Promise.race([this.client.ping(), timeout]);
    } finally {
      clearTimeout(timer!);
    }
  }

  async onModuleDestroy(): Promise<void> {
    // Release the connection on shutdown so it does not leak across rolling
    // deploys (mirrors enableShutdownHooks in main.ts). quit() is best-effort:
    // if the socket is already gone, disconnect() forces it closed.
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}
