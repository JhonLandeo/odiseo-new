import { JobsOptions } from 'bullmq';

/**
 * Default options for every job this module enqueues.
 *
 * Retries exist because PDF generation depends on remote services (GCS signing,
 * S3 upload, the question bank): a transient blip must not permanently lose a
 * teacher's material request. Without `attempts` a single network error left the
 * job dead with no retry at all.
 *
 * The `removeOn*` bounds exist because BullMQ keeps completed and failed jobs in
 * Redis forever by default. This queue runs per tenant, per week, per course, so
 * unbounded retention grows Redis without limit; failures are kept longer than
 * successes because they are what an operator needs to inspect.
 */
export const MATERIALS_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 5000,
  },
  removeOnComplete: { age: 3600, count: 100 },
  removeOnFail: { age: 86400, count: 500 },
};
