import { EventEmitter } from 'events';
import { HttpMetricsMiddleware } from './http-metrics.middleware';
import { MetricsRegistry } from './metrics.registry';

describe('HttpMetricsMiddleware', () => {
  let metrics: MetricsRegistry;
  let middleware: HttpMetricsMiddleware;

  beforeEach(() => {
    metrics = new MetricsRegistry();
    middleware = new HttpMetricsMiddleware(metrics);
  });

  afterEach(() => {
    metrics.registry.clear();
  });

  const makeRes = (statusCode: number) => {
    const res = new EventEmitter() as any;
    res.statusCode = statusCode;
    return res;
  };

  it('records the matched route pattern, not the raw path, once the request finishes', async () => {
    const observeSpy = jest.spyOn(metrics.httpRequestDuration, 'observe');
    const req: any = {
      method: 'GET',
      baseUrl: '/api/v1',
      route: { path: '/materials/:id' },
    };
    const res = makeRes(200);
    const next = jest.fn();

    middleware.use(req, res, next);
    expect(next).toHaveBeenCalled();

    res.emit('finish');

    expect(observeSpy).toHaveBeenCalledWith(
      {
        method: 'GET',
        route: '/api/v1/materials/:id',
        status_code: '200',
      },
      expect.any(Number),
    );
  });

  it('falls back to a fixed "unmatched" label when no route matched (e.g. a 404)', () => {
    const observeSpy = jest.spyOn(metrics.httpRequestDuration, 'observe');
    const req: any = { method: 'GET', baseUrl: '', route: undefined };
    const res = makeRes(404);

    middleware.use(req, res, jest.fn());
    res.emit('finish');

    expect(observeSpy).toHaveBeenCalledWith(
      { method: 'GET', route: 'unmatched', status_code: '404' },
      expect.any(Number),
    );
  });

  it('collapses an unrecognized/attacker-controlled method to a fixed "OTHER" label', () => {
    // This middleware runs pre-auth on every request with no rate limiting in
    // front of it — an unbounded label here is a real memory-growth vector,
    // not just a cosmetic concern.
    const observeSpy = jest.spyOn(metrics.httpRequestDuration, 'observe');
    const req: any = {
      method: 'GARBAGE-METHOD-1234',
      baseUrl: '',
      route: undefined,
    };
    const res = makeRes(400);

    middleware.use(req, res, jest.fn());
    res.emit('finish');

    expect(observeSpy).toHaveBeenCalledWith(
      { method: 'OTHER', route: 'unmatched', status_code: '400' },
      expect.any(Number),
    );
  });

  it('calls next() synchronously without waiting for the response to finish', () => {
    const req: any = { method: 'GET', baseUrl: '', route: undefined };
    const res = makeRes(200);
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
