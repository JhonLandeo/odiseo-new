import { Test, TestingModule } from '@nestjs/testing';
import {
  HealthCheckService,
  HealthIndicatorResult,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { RedisHealthIndicator } from './redis-health.indicator';

/**
 * Stand-in for HealthCheckService that actually runs the indicator callbacks
 * the controller passes in and aggregates their results, so the test exercises
 * the real wiring (which indicators each route checks) rather than a stub that
 * ignores its argument.
 */
const runChecks = async (
  checks: Array<() => Promise<HealthIndicatorResult>>,
) => {
  const results = await Promise.all(checks.map((c) => c()));
  const details = Object.assign({}, ...results);
  const isDown = Object.values(details).some(
    (d) => (d as { status: string }).status === 'down',
  );
  return {
    status: isDown ? 'error' : 'ok',
    info: isDown ? {} : details,
    error: {},
    details,
  };
};

describe('HealthController', () => {
  let controller: HealthController;
  let db: { pingCheck: jest.Mock };
  let redis: { isHealthy: jest.Mock };

  beforeEach(async () => {
    db = { pingCheck: jest.fn() };
    redis = { isHealthy: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: { check: runChecks } },
        { provide: TypeOrmHealthIndicator, useValue: db },
        { provide: RedisHealthIndicator, useValue: redis },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  describe('liveness', () => {
    it('reports up without checking any dependency', async () => {
      const result = await controller.liveness();

      expect(result.status).toBe('ok');
      expect(db.pingCheck).not.toHaveBeenCalled();
      expect(redis.isHealthy).not.toHaveBeenCalled();
    });
  });

  describe('readiness', () => {
    it('reports up when both the database and Redis are reachable', async () => {
      db.pingCheck.mockResolvedValue({ database: { status: 'up' } });
      redis.isHealthy.mockResolvedValue({ redis: { status: 'up' } });

      const result = await controller.readiness();

      expect(db.pingCheck).toHaveBeenCalledWith('database');
      expect(redis.isHealthy).toHaveBeenCalledWith('redis');
      expect(result.status).toBe('ok');
      expect(result.details).toEqual({
        database: { status: 'up' },
        redis: { status: 'up' },
      });
    });

    it('reports error when a dependency is down', async () => {
      db.pingCheck.mockResolvedValue({ database: { status: 'up' } });
      redis.isHealthy.mockResolvedValue({
        redis: { status: 'down', message: 'unreachable' },
      });

      const result = await controller.readiness();

      expect(result.status).toBe('error');
      expect(result.details.redis).toEqual({
        status: 'down',
        message: 'unreachable',
      });
    });
  });
});
