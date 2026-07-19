import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import Keyv from 'keyv';
import KeyvRedis from '@keyv/redis';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { Company } from './entities/tenant.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Company]),
    // Redis-backed, like the auth-state cache: the subdomain lookup runs in
    // every replica, and the explicit invalidation on company mutations must
    // reach all of them — an in-process cache would leave the other instances
    // serving a suspended company until their own TTL expired. No module-level
    // ttl; the lifetime is set per entry in TenantsService.findBySubdomain.
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
    forwardRef(() => AuthModule),
  ],
  controllers: [TenantsController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
