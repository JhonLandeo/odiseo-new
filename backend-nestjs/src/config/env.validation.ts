import * as Joi from 'joi';
import { EXPIRATION_PATTERN } from '../auth/jwt-expiration.util';

/**
 * Fail-fast environment contract.
 *
 * Every setting below used to have an inline `|| <dev value>` fallback, so a
 * production process with a missing variable booted happily and pointed at the
 * wrong place — LocalStack instead of S3, the dev GCS bucket, `postgres` as the
 * database password. The failure only showed up later as missing or misfiled
 * user data. Validating at boot turns that into a crash on deploy, which is the
 * cheapest possible place to catch it.
 *
 * Production-only requirements are expressed with `Joi.when` so local
 * development and CI keep working without a fully populated env file.
 */
const requiredInProduction = <T extends Joi.AnySchema>(schema: T): T =>
  schema.when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.optional(),
  });

export const envValidationSchema = Joi.object({
  // Intentionally not defaulted. An unset NODE_ENV must never be *treated* as a
  // permissive environment either — that decision lives in cors-origin.util.ts,
  // which allowlists `development`/`test` explicitly rather than negating
  // `production`.
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'staging', 'production')
    .optional(),
  PORT: Joi.number().port().default(3000),

  // Required everywhere — the app cannot do anything meaningful without these.
  JWT_SECRET: Joi.string().min(1).required(),
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().port().required(),
  DB_NAME: Joi.string().required(),
  DB_USER: Joi.string().required(),
  DB_PASS: Joi.string().allow('').required(),

  // Required in production only.
  AWS_S3_ENDPOINT: requiredInProduction(Joi.string().uri()),
  AWS_S3_BUCKET: requiredInProduction(Joi.string()),
  AWS_REGION: requiredInProduction(Joi.string()),
  GOOGLE_CLOUD_PROJECT_ID: requiredInProduction(Joi.string()),
  GOOGLE_CLOUD_STORAGE_BUCKET: requiredInProduction(Joi.string()),
  REDIS_HOST: requiredInProduction(Joi.string()),
  REDIS_PORT: requiredInProduction(Joi.number().port()),
  BASE_DOMAIN: requiredInProduction(Joi.string()),
  COOKIE_DOMAIN: requiredInProduction(Joi.string()),
  WORKER_WEBHOOK_SECRET: requiredInProduction(Joi.string()),

  // Optional — sensible defaults live in the consuming services. Format is
  // constrained to the same EXPIRATION_PATTERN jwt-expiration.util.ts parses
  // with: jsonwebtoken only validates this at SIGN time (via the `ms`
  // package), so an unvalidated typo would boot cleanly and then 500 on every
  // login instead of failing fast at startup.
  JWT_EXPIRATION: Joi.string().pattern(EXPIRATION_PATTERN).optional(),
  AUTH_STATE_CACHE_TIMEOUT_MS: Joi.number().integer().positive().optional(),
  COMPANY_LOOKUP_CACHE_TTL_MS: Joi.number().integer().positive().optional(),
  COMPANY_LOOKUP_CACHE_TIMEOUT_MS: Joi.number().integer().positive().optional(),
  CATALOG_CACHE_TIMEOUT_MS: Joi.number().integer().positive().optional(),
  GOOGLE_CLOUD_KEY_FILE: Joi.string().optional(),
  GCS_SIGNED_URL_TIMEOUT_MS: Joi.number().integer().positive().default(5000),
  DB_QUESTIONS_BASE: Joi.string().optional(),
  DB_QUESTIONS_NAME: Joi.string().optional(),
  // Pino log level. Constrained to pino's own level names so a typo fails
  // fast at boot instead of silently falling back to 'info' deep inside
  // pino's own (unvalidated) level parsing.
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace')
    .default('info'),
  // Required in production: an unset value defaults to registering the
  // PDF-generation processor (heavy headless-browser work) inside whatever
  // process boots, silently defeating the API/worker compute-isolation
  // invariant (see materials.module.ts) if an operator forgets to set it on
  // an API replica. Left optional outside production so local dev/tests keep
  // today's "both roles in one process" default.
  PROCESS_ROLE: requiredInProduction(Joi.string().valid('api', 'worker')),
}).unknown(true);

/**
 * `abortEarly: false` so a misconfigured deploy reports every missing variable
 * in one crash instead of one per restart.
 */
export const envValidationOptions = {
  abortEarly: false,
};
