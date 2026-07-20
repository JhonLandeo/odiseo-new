import { JobsOptions } from 'bullmq';

/**
 * Default options for the tenant-provisioning-queue.
 *
 * Retries exist because provisioning (schema creation, migrations, role seed)
 * depends on a live Postgres connection: a transient blip (pool exhaustion, a
 * brief network hiccup) must not permanently strand a company in
 * isActive: false with no automatic recovery, the way a lost in-process event
 * did before this queue existed. `SchemaService.createTenantSchema` (CREATE
 * SCHEMA IF NOT EXISTS) and `seedTenantSchema` (migrations tracked per-schema
 * in `_tenant_migrations`, role seed via ON CONFLICT DO NOTHING) are both
 * idempotent, so re-running the whole job on retry is safe and never
 * double-provisions.
 *
 * The `removeOn*` bounds exist for the same reason as materials-queue.constants.ts:
 * BullMQ keeps completed/failed jobs in Redis forever by default. Provisioning
 * is a one-shot operation per tenant — at most a handful of jobs a day, not
 * per-request traffic — so retention is kept small: enough completed jobs to
 * spot-check recent onboarding, and failed jobs kept longer (an exhausted job
 * means the company was suspended and needs operator attention via
 * TenantsAdminService.updateStatus's reactivation path).
 */
export const TENANT_PROVISIONING_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 5000,
  },
  removeOnComplete: { age: 3600, count: 50 },
  removeOnFail: { age: 86400, count: 100 },
};
