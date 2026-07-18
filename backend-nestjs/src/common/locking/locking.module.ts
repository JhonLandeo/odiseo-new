import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import KeyvRedis from '@keyv/redis';
import { DISTRIBUTED_LOCK } from './distributed-lock.interface';
import {
  LOCK_REDIS_CLIENT,
  LockRedisClient,
  RedisDistributedLock,
} from './redis-distributed-lock';

/**
 * Global so any module with a `@Cron` can inject DISTRIBUTED_LOCK without
 * re-declaring the Redis wiring, mirroring how AuthModule and CatalogsModule
 * each build their own Keyv/Redis store.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: LOCK_REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const host = config.get<string>('REDIS_HOST') || 'localhost';
        const port = parseInt(config.get<string>('REDIS_PORT') || '6379', 10);
        const store = new KeyvRedis(`redis://${host}:${port}`);
        // Resolved lazily and per call: the client connects on first use, so
        // booting the app never blocks on Redis being reachable.
        return (): Promise<LockRedisClient> =>
          store.getClient() as unknown as Promise<LockRedisClient>;
      },
    },
    {
      provide: DISTRIBUTED_LOCK,
      useClass: RedisDistributedLock,
    },
  ],
  exports: [DISTRIBUTED_LOCK],
})
export class LockingModule {}
