import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { MetricsController } from './metrics.controller';
import { MetricsRegistry } from './metrics.registry';

describe('MetricsController', () => {
  let controller: MetricsController;
  let metrics: MetricsRegistry;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MetricsController],
      providers: [MetricsRegistry],
    }).compile();

    controller = module.get<MetricsController>(MetricsController);
    metrics = module.get<MetricsRegistry>(MetricsRegistry);
  });

  afterEach(() => {
    metrics.registry.clear();
  });

  it('is marked @Public(), the same exemption JwtAuthGuard reads for /health', () => {
    const reflector = new Reflector();

    expect(
      reflector.get<boolean>(
        IS_PUBLIC_KEY,
        MetricsController.prototype.getMetrics,
      ),
    ).toBe(true);
  });

  it('returns Prometheus text-exposition format with the registry content type', async () => {
    const res = {
      setHeader: jest.fn(),
      send: jest.fn(),
    } as any;

    await controller.getMetrics(res);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      metrics.registry.contentType,
    );
    const body = res.send.mock.calls[0][0] as string;
    expect(typeof body).toBe('string');
    // Default Node.js process metrics from collectDefaultMetrics().
    expect(body).toContain('# HELP process_cpu_user_seconds_total');
    // The custom HTTP duration histogram this module registers.
    expect(body).toContain('# HELP http_request_duration_seconds');
  });

  it('reflects an httpRequestDuration observation in the scraped output', async () => {
    metrics.httpRequestDuration.observe(
      { method: 'GET', route: '/materials/:id', status_code: '200' },
      0.42,
    );

    const res = { setHeader: jest.fn(), send: jest.fn() } as any;
    await controller.getMetrics(res);

    const body = res.send.mock.calls[0][0] as string;
    expect(body).toContain('route="/materials/:id"');
    expect(body).toContain('status_code="200"');
  });
});
