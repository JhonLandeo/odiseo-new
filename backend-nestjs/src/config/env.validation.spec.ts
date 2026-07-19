import { envValidationOptions, envValidationSchema } from './env.validation';

/**
 * Minimal env satisfying every var required in every environment (see
 * env.validation.ts), so each test only needs to vary the field under test.
 */
const baseEnv = {
  JWT_SECRET: 'a-long-random-secret',
  DB_HOST: 'localhost',
  DB_PORT: 5432,
  DB_NAME: 'odiseo',
  DB_USER: 'postgres',
  DB_PASS: 'postgres',
};

/** Adds every var required ONLY in production, so production-only tests can
 * isolate the field under test instead of tripping unrelated requirements. */
const productionEnv = {
  ...baseEnv,
  NODE_ENV: 'production',
  AWS_S3_ENDPOINT: 'https://s3.example.com',
  AWS_S3_BUCKET: 'bucket',
  AWS_REGION: 'us-east-1',
  GOOGLE_CLOUD_PROJECT_ID: 'project',
  GOOGLE_CLOUD_STORAGE_BUCKET: 'gcs-bucket',
  REDIS_HOST: 'redis',
  REDIS_PORT: 6379,
  BASE_DOMAIN: 'odiseo.com',
  COOKIE_DOMAIN: '.odiseo.com',
  WORKER_WEBHOOK_SECRET: 'a-long-random-secret',
};

const validate = (env: Record<string, unknown>) =>
  envValidationSchema.validate(env, envValidationOptions);

describe('envValidationSchema', () => {
  describe('JWT_EXPIRATION', () => {
    it('passes when unset', () => {
      const { error } = validate({ ...baseEnv });

      expect(error).toBeUndefined();
    });

    it.each(['1d', '24h', '15m', '3600s', '3600', '1w', '1y'])(
      'passes for a valid value %s',
      (JWT_EXPIRATION) => {
        const { error } = validate({ ...baseEnv, JWT_EXPIRATION });

        expect(error).toBeUndefined();
      },
    );

    it.each(['not-a-duration', '1dd', 'd1', '-5m', ''])(
      'fails for a malformed value %s',
      (JWT_EXPIRATION) => {
        const { error } = validate({ ...baseEnv, JWT_EXPIRATION });

        expect(error).toBeDefined();
        expect(
          error?.details.some((d) => d.path.includes('JWT_EXPIRATION')),
        ).toBe(true);
      },
    );
  });

  describe('PROCESS_ROLE', () => {
    it('is optional outside production', () => {
      const { error } = validate({ ...baseEnv, NODE_ENV: 'development' });

      expect(error).toBeUndefined();
    });

    it('is optional in test', () => {
      const { error } = validate({ ...baseEnv, NODE_ENV: 'test' });

      expect(error).toBeUndefined();
    });

    it('is required in production', () => {
      const { error } = validate({ ...productionEnv });

      expect(error).toBeDefined();
      expect(error?.details.some((d) => d.path.includes('PROCESS_ROLE'))).toBe(
        true,
      );
    });

    it.each(['api', 'worker'])(
      'passes in production when set to %s',
      (PROCESS_ROLE) => {
        const { error } = validate({ ...productionEnv, PROCESS_ROLE });

        expect(error).toBeUndefined();
      },
    );

    it('fails in production for an invalid role', () => {
      const { error } = validate({
        ...productionEnv,
        PROCESS_ROLE: 'not-a-role',
      });

      expect(error).toBeDefined();
      expect(error?.details.some((d) => d.path.includes('PROCESS_ROLE'))).toBe(
        true,
      );
    });
  });
});
