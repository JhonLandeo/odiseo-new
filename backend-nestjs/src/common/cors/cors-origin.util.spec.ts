import {
  createCorsOriginValidator,
  isPermissiveCorsEnvironment,
} from './cors-origin.util';

describe('cors-origin.util', () => {
  const baseDomain = 'odiseo.com';

  const check = (nodeEnv: string | undefined, origin: string) => {
    const validator = createCorsOriginValidator({ nodeEnv, baseDomain });
    let error: Error | null = null;
    let allowed: boolean | undefined;
    validator(origin, (err, allow) => {
      error = err;
      allowed = allow;
    });
    return { error, allowed };
  };

  describe('isPermissiveCorsEnvironment', () => {
    it('opens only for explicitly permissive environments', () => {
      expect(isPermissiveCorsEnvironment('development')).toBe(true);
      expect(isPermissiveCorsEnvironment('test')).toBe(true);
    });

    // The regression this whole module exists for: the old gate was
    // `NODE_ENV !== 'production'`, which opened for all of these.
    it.each([undefined, '', 'production', 'staging', 'prod', 'Development'])(
      'stays closed for NODE_ENV=%p',
      (nodeEnv) => {
        expect(isPermissiveCorsEnvironment(nodeEnv)).toBe(false);
      },
    );
  });

  describe('createCorsOriginValidator', () => {
    it('rejects an untrusted origin when NODE_ENV is unset', () => {
      const { error, allowed } = check(undefined, 'https://evil.example');
      expect(error).toBeInstanceOf(Error);
      expect(allowed).toBeUndefined();
    });

    it.each(['staging', 'prod', 'production'])(
      'rejects an untrusted origin when NODE_ENV=%s',
      (nodeEnv) => {
        expect(check(nodeEnv, 'https://evil.example').error).toBeInstanceOf(
          Error,
        );
      },
    );

    it('allows any origin in development', () => {
      expect(check('development', 'https://evil.example')).toEqual({
        error: null,
        allowed: true,
      });
    });

    it('allows the base domain and its subdomains under a strict env', () => {
      expect(check('production', 'https://odiseo.com').allowed).toBe(true);
      expect(check(undefined, 'https://acme.odiseo.com').allowed).toBe(true);
      expect(check(undefined, 'http://localhost:5173').allowed).toBe(true);
    });

    it('allows requests with no Origin header (non-browser clients)', () => {
      expect(check(undefined, '').allowed).toBe(true);
    });

    it('does not treat a lookalike domain as a subdomain', () => {
      expect(check(undefined, 'https://notodiseo.com').error).toBeInstanceOf(
        Error,
      );
      expect(
        check(undefined, 'https://odiseo.com.evil.example').error,
      ).toBeInstanceOf(Error);
    });
  });
});
