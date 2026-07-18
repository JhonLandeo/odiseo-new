/**
 * Environments where CORS is allowed to open up to any origin.
 *
 * This is an explicit opt-in allowlist rather than a `!== 'production'` check.
 * The API sets `credentials: true` and authenticates with httpOnly JWT cookies,
 * so an "allow any origin" answer is enough for any website to drive the API as
 * a logged-in user. The old gate opened whenever `NODE_ENV` was anything other
 * than the exact string `production` — which includes `staging`, a typo like
 * `prod`, and (most dangerously) *unset*, the default when running
 * `node dist/main` without an env file. Fail closed: unknown means strict.
 */
const PERMISSIVE_ENVIRONMENTS = ['development', 'test'];

export type CorsOriginCallback = (err: Error | null, allow?: boolean) => void;

export function isPermissiveCorsEnvironment(nodeEnv?: string): boolean {
  return PERMISSIVE_ENVIRONMENTS.includes(nodeEnv ?? '');
}

/**
 * Builds the `origin` validator handed to `app.enableCors()`.
 *
 * `baseDomain` is read once at bootstrap so the allowlist is fixed for the
 * lifetime of the process instead of being recomputed per request.
 */
export function createCorsOriginValidator(options: {
  nodeEnv?: string;
  baseDomain: string;
}) {
  const permissive = isPermissiveCorsEnvironment(options.nodeEnv);
  const allowedOrigins = [
    `https://${options.baseDomain}`,
    'http://localhost:5173',
  ];

  return (requestOrigin: string, callback: CorsOriginCallback): void => {
    if (permissive) {
      return callback(null, true);
    }

    // No `Origin` header means the request did not come from a browser page
    // (curl, server-to-server, health checks). CORS is a browser-enforced
    // policy, so there is no cross-site request forgery vector to block here —
    // browsers always attach `Origin` to the cross-origin, credentialed
    // requests this validator exists to stop. Note this only decides the CORS
    // headers; authentication and authorization still run for these requests.
    if (!requestOrigin) {
      return callback(null, true);
    }

    // Allow exact matches or any subdomain of the base domain
    if (
      allowedOrigins.includes(requestOrigin) ||
      requestOrigin.endsWith(`.${options.baseDomain}`)
    ) {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'));
  };
}
