import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConsumptionMetric } from './entities/consumption-metric.entity';

interface MetricRow {
  tenantId: string;
  metricType: string;
  value: number;
  billingYear: number;
  billingMonth: number;
}

const METRIC_ACTIVE_USERS = 'active_users';
const METRIC_QUESTIONS_USED = 'questions_used';
const METRIC_PDF_PAGES_GENERATED = 'pdf_pages_generated';
const METRIC_STORAGE_MB = 'storage_mb';

/**
 * Reads pre-aggregated billing metrics from `public.consumption_metrics`
 * (spec 008 FR-007). The former implementation fanned a live cross-schema
 * query out to every tenant on EVERY request — an O(N-tenant) read on the
 * request path that does not scale and could never satisfy `storage_mb` /
 * `pdf_pages_generated` (nothing wrote them). `ConsumptionMetricsCron`
 * (consumption-metrics.cron.ts) now fills this table hourly, off the request
 * path (spec clarification "Asincronía Extrema"); this service only reads it.
 *
 * A tenant/bucket with no row yet (brand-new tenant, cron hasn't run) simply
 * contributes 0 — never throws, never falls back to a live scan.
 */
@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(ConsumptionMetric)
    private readonly metricRepository: Repository<ConsumptionMetric>,
  ) {}

  async getMetrics(tenantId: string, startDate?: string, endDate?: string) {
    if (tenantId !== 'all' && !tenantId) {
      throw new BadRequestException('tenant_id is required');
    }

    const range = this.parseDateRange(startDate, endDate);
    const buckets = this.resolveMonthBuckets(range);
    const rows = await this.fetchMetricRows(tenantId, buckets);

    return {
      // active_users is a live headcount SNAPSHOT written every cron run, not
      // an additive flow — summing it across months would triple-count a
      // tenant present in 3 monthly buckets. Take each tenant's LATEST bucket
      // in the resolved range, then sum across tenants (disjoint user bases,
      // so summing tenants IS correct).
      active_users: this.latestBucketPerTenantSum(rows, METRIC_ACTIVE_USERS),
      // questions_used and pdf_pages_generated are monthly flow accumulators
      // (spec clarification "Opción B - Mensual"): summing every resolved
      // bucket (and every tenant for 'all') is the correct aggregation.
      questions_used: this.sumAcrossBuckets(rows, METRIC_QUESTIONS_USED),
      // storage_mb is cumulative-snapshot-like, same reasoning as
      // active_users (the S3 component is all-time cumulative, not monthly).
      storage_mb: this.latestBucketPerTenantSum(rows, METRIC_STORAGE_MB),
      pdf_pages_generated: this.sumAcrossBuckets(
        rows,
        METRIC_PDF_PAGES_GENERATED,
      ),
    };
  }

  /** Sums `value` for a metric type across every row (every bucket, every tenant in scope). */
  private sumAcrossBuckets(rows: MetricRow[], metricType: string): number {
    return rows
      .filter((r) => r.metricType === metricType)
      .reduce((sum, r) => sum + r.value, 0);
  }

  /**
   * For a snapshot-like metric (active_users, storage_mb): picks each
   * tenant's most recent (billing_year, billing_month) bucket within the rows
   * already scoped to the resolved range, then sums those latest values
   * across tenants. A tenant with no row for this metric in range simply
   * contributes nothing (0), not an error.
   */
  private latestBucketPerTenantSum(
    rows: MetricRow[],
    metricType: string,
  ): number {
    const latestPerTenant = new Map<
      string,
      { year: number; month: number; value: number }
    >();

    for (const row of rows) {
      if (row.metricType !== metricType) continue;
      const existing = latestPerTenant.get(row.tenantId);
      const isNewer =
        !existing ||
        row.billingYear > existing.year ||
        (row.billingYear === existing.year &&
          row.billingMonth > existing.month);
      if (isNewer) {
        latestPerTenant.set(row.tenantId, {
          year: row.billingYear,
          month: row.billingMonth,
          value: row.value,
        });
      }
    }

    let total = 0;
    for (const bucket of latestPerTenant.values()) {
      total += bucket.value;
    }
    return total;
  }

  /**
   * Fetches every `consumption_metrics` row for the requested tenant scope
   * (a single tenant, or every tenant for 'all') that falls in one of the
   * resolved (billing_year, billing_month) buckets. Parameterized throughout;
   * `tenantId` and the bucket values are bound, never interpolated.
   */
  private async fetchMetricRows(
    tenantId: string,
    buckets: Array<{ year: number; month: number }>,
  ): Promise<MetricRow[]> {
    const params: Array<string | number> = [];
    const bucketClauses = buckets.map((bucket) => {
      params.push(bucket.year, bucket.month);
      const yearIdx = params.length - 1;
      const monthIdx = params.length;
      return `(billing_year = $${yearIdx} AND billing_month = $${monthIdx})`;
    });

    let tenantClause = '';
    if (tenantId !== 'all') {
      params.push(tenantId);
      tenantClause = `tenant_id = $${params.length} AND `;
    }

    const rows: Array<{
      tenant_id: string;
      metric_type: string;
      value: string;
      billing_year: number;
      billing_month: number;
    }> = await this.metricRepository.manager.query(
      `SELECT tenant_id, metric_type, value, billing_year, billing_month
       FROM public.consumption_metrics
       WHERE ${tenantClause}(${bucketClauses.join(' OR ')})`,
      params,
    );

    return rows.map((r) => ({
      tenantId: r.tenant_id,
      metricType: r.metric_type,
      value: parseInt(r.value, 10),
      billingYear: r.billing_year,
      billingMonth: r.billing_month,
    }));
  }

  /**
   * Resolves which (billing_year, billing_month) buckets the requested date
   * range overlaps. A range narrower than a month still touches exactly the
   * month(s) it overlaps. With no range at all, resolves to the CURRENT month
   * only, matching "what the dashboard shows right now".
   */
  private resolveMonthBuckets(range: {
    start?: Date;
    endExclusive?: Date;
  }): Array<{ year: number; month: number }> {
    const now = new Date();
    // endExclusive is exclusive; the last covered instant is 1ms before it.
    // Computed BEFORE startBoundary so an end_date-only request derives its
    // start from that same instant (both boundaries land in the requested
    // month) instead of from the exclusive boundary itself, which can already
    // be the 1st of the FOLLOWING month — that previously made an end_date-
    // only request with no start_date resolve to an empty bucket range and
    // silently fall back to the current month instead of the requested one.
    const endBoundary = range.endExclusive
      ? new Date(range.endExclusive.getTime() - 1)
      : (range.start ?? now);
    const startBoundary = range.start ?? endBoundary;

    const buckets: Array<{ year: number; month: number }> = [];
    let year = startBoundary.getUTCFullYear();
    let month = startBoundary.getUTCMonth(); // 0-based
    const endYear = endBoundary.getUTCFullYear();
    const endMonth = endBoundary.getUTCMonth();

    // Guards against a pathological/inverted range looping forever.
    let iterations = 0;
    while (
      (year < endYear || (year === endYear && month <= endMonth)) &&
      iterations < 1200
    ) {
      buckets.push({ year, month: month + 1 });
      month += 1;
      if (month > 11) {
        month = 0;
        year += 1;
      }
      iterations += 1;
    }

    if (buckets.length === 0) {
      buckets.push({
        year: now.getUTCFullYear(),
        month: now.getUTCMonth() + 1,
      });
    }

    return buckets;
  }

  // An unparseable date is a caller error, not something to silently ignore
  // into an unfiltered total.
  private parseDateRange(
    startDate?: string,
    endDate?: string,
  ): { start?: Date; endExclusive?: Date } {
    const parse = (label: string, value?: string): Date | undefined => {
      if (!value) return undefined;
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException(`${label} is not a valid date: ${value}`);
      }
      return parsed;
    };

    const end = parse('end_date', endDate);

    return {
      start: parse('start_date', startDate),
      // end_date is inclusive of its ENTIRE final day. A date-only string
      // parses to midnight UTC, so filtering with `<= end` silently dropped
      // the last day; the canonical fix is an exclusive upper bound of
      // end_date + 1 day.
      endExclusive:
        end === undefined
          ? undefined
          : new Date(end.getTime() + 24 * 60 * 60 * 1000),
    };
  }
}
