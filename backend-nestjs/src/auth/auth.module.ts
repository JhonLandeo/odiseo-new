import { Global, Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './auth.guard';
import { User } from './entities/user.entity';
import { TenantsModule } from '../tenants/tenants.module';
import { CacheModule } from '@nestjs/cache-manager';
import { ThrottlerModule } from '@nestjs/throttler';
import Redis from 'ioredis';
import Keyv from 'keyv';
import KeyvRedis from '@keyv/redis';
import { RedisThrottlerStorage } from './redis-throttler-storage';

// Global so JwtAuthGuard/AuthService resolve from the root injector: both are
// registered as APP_GUARD in AppModule and must be constructible for every
// feature module without each one importing AuthModule.
@Global()
@Module({
  imports: [
    // Redis-backed so permission invalidation actually reaches every worker: an
    // in-process cache would leave stale permissions alive on the other
    // instances until their own TTL expired. No module-level ttl here — the 60s
    // lifetime is set per entry in AuthService.getUserPermissions().
    CacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const host = config.get<string>('REDIS_HOST') || 'localhost';
        const port = parseInt(config.get<string>('REDIS_PORT') || '6379', 10);
        return {
          stores: [
            new Keyv({ store: new KeyvRedis(`redis://${host}:${port}`) }),
          ],
        };
      },
    }),
    // Rate limiting for auth endpoints (brute-force protection on /auth/login).
    // Backed by the shared Redis so the limit is GLOBAL across every replica:
    // the default in-memory storage counts per process, letting N replicas each
    // grant the 5/min login allowance (N×5/min total) and weakening brute-force
    // protection under horizontal scaling. Same ttl/limit as before — only the
    // storage backend changed.
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const host = config.get<string>('REDIS_HOST') || 'localhost';
        const port = parseInt(config.get<string>('REDIS_PORT') || '6379', 10);
        const redis = new Redis({
          host,
          port,
          // Fail fast instead of queuing: a Redis outage should degrade to
          // "allow" (see RedisThrottlerStorage) rather than hang the login
          // request waiting on the offline command queue.
          enableOfflineQueue: false,
          maxRetriesPerRequest: 1,
          // Keep reconnecting so throttling resumes automatically once Redis
          // comes back.
          retryStrategy: (times) => Math.min(times * 200, 2000),
        });
        // ioredis emits 'error' on every failed (re)connect; without a listener
        // that would crash the process. RedisThrottlerStorage already logs and
        // fails open on the actual command, so this handler just prevents the
        // crash.
        redis.on('error', () => undefined);
        return {
          throttlers: [{ ttl: 60_000, limit: 10 }],
          storage: new RedisThrottlerStorage(redis),
        };
      },
    }),
    TypeOrmModule.forFeature([User]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret) {
          // Fail fast instead of falling back: a checked-in default key is a
          // published key, and anyone holding it can forge a token for any
          // tenant. A refused boot is strictly safer than a silent forgery.
          throw new Error(
            'JWT_SECRET is not set. Refusing to start: falling back to a default signing key would allow anyone to forge tokens for any tenant.',
          );
        }
        return {
          secret,
          signOptions: { expiresIn: '24h' as const },
        };
      },
    }),
    forwardRef(() => TenantsModule),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard],
  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}
