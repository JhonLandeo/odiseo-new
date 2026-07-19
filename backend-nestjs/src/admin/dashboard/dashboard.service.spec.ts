import { BadRequestException } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

/**
 * `public.consumption_metrics` rows, in the shape `manager.query` returns
 * (snake_case, `value` as a Postgres bigint string).
 */
interface RawRow {
  tenant_id: string;
  metric_type: string;
  value: string;
  billing_year: number;
  billing_month: number;
}

function row(
  tenantId: string,
  metricType: string,
  value: number,
  year: number,
  month: number,
): RawRow {
  return {
    tenant_id: tenantId,
    metric_type: metricType,
    value: String(value),
    billing_year: year,
    billing_month: month,
  };
}

function createService(rows: RawRow[]) {
  const query = jest.fn().mockResolvedValue(rows);
  const metricRepository = { manager: { query } };
  const service = new DashboardService(metricRepository as any);
  return { service, query };
}

describe('DashboardService.getMetrics', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-19T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('rejects when tenant_id is missing', async () => {
    const { service } = createService([]);
    await expect(service.getMetrics('')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('does not require tenant_id for the aggregate "all" scope', async () => {
    const { service } = createService([]);
    await expect(service.getMetrics('all')).resolves.toBeDefined();
  });

  it('rejects an unparseable date instead of silently returning unfiltered totals', async () => {
    const { service } = createService([]);
    await expect(service.getMetrics('c1', 'not-a-date')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('contributes 0 for every metric when no row exists yet (brand-new tenant, cron has not run)', async () => {
    const { service } = createService([]);
    const metrics = await service.getMetrics('c1');
    expect(metrics).toEqual({
      active_users: 0,
      questions_used: 0,
      storage_mb: 0,
      pdf_pages_generated: 0,
    });
  });

  describe('month-bucket resolution', () => {
    it('resolves the CURRENT month only when no date range is given', async () => {
      const { service, query } = createService([]);

      await service.getMetrics('c1');

      const [, params] = query.mock.calls[0];
      // System time is fixed to 2026-07-19: current month is July (7) 2026.
      expect(params).toEqual(expect.arrayContaining([2026, 7]));
    });

    it('resolves a single bucket for a range narrower than a month', async () => {
      const { service, query } = createService([]);

      await service.getMetrics('c1', '2026-01-10', '2026-01-20');

      const [sql, params] = query.mock.calls[0];
      expect(sql).not.toMatch(/OR.*OR/s); // only one bucket clause
      expect(params).toEqual(expect.arrayContaining([2026, 1]));
    });

    it('resolves every month a multi-month range overlaps', async () => {
      const { service, query } = createService([]);

      await service.getMetrics('c1', '2026-01-15', '2026-03-05');

      const [, params] = query.mock.calls[0];
      // Jan, Feb, Mar 2026 all touched.
      expect(params).toEqual(
        expect.arrayContaining([2026, 1, 2026, 2, 2026, 3]),
      );
    });

    // Regression: an end_date-only request where end_date is the LAST day of
    // a month used to derive its start boundary from the exclusive upper
    // bound (already the 1st of the FOLLOWING month), producing an empty
    // bucket range that silently fell back to the CURRENT month — not the
    // requested one. System time is fixed to July 2026; if this regressed,
    // params would contain [2026, 7] instead of [2026, 1].
    it('resolves the requested month, not the current month, for an end_date-only request on the last day of a month', async () => {
      const { service, query } = createService([]);

      await service.getMetrics('c1', undefined, '2026-01-31');

      const [sql, params] = query.mock.calls[0];
      expect(sql).not.toMatch(/OR.*OR/s); // only one bucket clause
      expect(params).toEqual(expect.arrayContaining([2026, 1]));
    });

    it('resolves the requested month, not the current month, for a start_date-only request', async () => {
      const { service, query } = createService([]);

      await service.getMetrics('c1', '2026-02-01', undefined);

      const [, params] = query.mock.calls[0];
      expect(params).toEqual(expect.arrayContaining([2026, 2]));
    });
  });

  describe('flow metrics (questions_used, pdf_pages_generated): summed across buckets', () => {
    it('sums a monthly-flow metric across every resolved month', async () => {
      const rows = [
        row('c1', 'questions_used', 50, 2026, 1),
        row('c1', 'questions_used', 30, 2026, 2),
        row('c1', 'pdf_pages_generated', 100, 2026, 1),
        row('c1', 'pdf_pages_generated', 20, 2026, 2),
      ];
      const { service } = createService(rows);

      const metrics = await service.getMetrics(
        'c1',
        '2026-01-01',
        '2026-02-28',
      );

      expect(metrics.questions_used).toBe(80);
      expect(metrics.pdf_pages_generated).toBe(120);
    });
  });

  describe('snapshot metrics (active_users, storage_mb): LATEST bucket wins, never summed', () => {
    it('uses the latest bucket even when an EARLIER month has a much larger value', async () => {
      const rows = [
        // Earlier month has a far larger value than the latest month.
        row('c1', 'active_users', 1000, 2026, 1),
        row('c1', 'active_users', 12, 2026, 3),
        row('c1', 'storage_mb', 9000, 2026, 1),
        row('c1', 'storage_mb', 45, 2026, 3),
      ];
      const { service } = createService(rows);

      const metrics = await service.getMetrics(
        'c1',
        '2026-01-01',
        '2026-03-31',
      );

      // The latest bucket (March) wins; the sum (1012 / 9045) must NOT appear.
      expect(metrics.active_users).toBe(12);
      expect(metrics.storage_mb).toBe(45);
    });

    it('falls back to whatever bucket exists when only one is present in range', async () => {
      const rows = [row('c1', 'active_users', 7, 2026, 2)];
      const { service } = createService(rows);

      const metrics = await service.getMetrics(
        'c1',
        '2026-01-01',
        '2026-02-28',
      );

      expect(metrics.active_users).toBe(7);
    });
  });

  describe("aggregate ('all') scope", () => {
    it('sums flow metrics across every tenant AND every bucket', async () => {
      const rows = [
        row('c1', 'questions_used', 10, 2026, 1),
        row('c2', 'questions_used', 20, 2026, 1),
        row('c1', 'questions_used', 5, 2026, 2),
      ];
      const { service } = createService(rows);

      const metrics = await service.getMetrics(
        'all',
        '2026-01-01',
        '2026-02-28',
      );

      expect(metrics.questions_used).toBe(35);
    });

    it("sums each tenant's LATEST-bucket snapshot value, never the cross-tenant-cross-month sum", async () => {
      const rows = [
        // c1: latest (Feb) = 5, an earlier much bigger Jan value must be ignored.
        row('c1', 'active_users', 500, 2026, 1),
        row('c1', 'active_users', 5, 2026, 2),
        // c2: only present in Jan.
        row('c2', 'active_users', 3, 2026, 1),
      ];
      const { service } = createService(rows);

      const metrics = await service.getMetrics(
        'all',
        '2026-01-01',
        '2026-02-28',
      );

      // c1 contributes its latest (5), c2 contributes its only bucket (3).
      expect(metrics.active_users).toBe(8);
    });

    it('does not require a tenant_id filter clause in the query', async () => {
      const { service, query } = createService([]);

      await service.getMetrics('all');

      const [sql] = query.mock.calls[0];
      expect(sql).not.toMatch(/tenant_id\s*=/);
    });
  });
});
