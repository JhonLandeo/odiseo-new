import { setActivePinia, createPinia } from 'pinia';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { navigateTo } from '#app';
import { applySubdomainHeader, handleApiResponseError } from '../../src/plugins/api';
import { useAuthStore } from '../../src/stores/auth.store';
import { CHANGE_PASSWORD_PATH } from '../../src/core/auth/password-change-required';

/**
 * Exercises the two interceptor behaviours the `api` plugin wires up. Testing the
 * exported handlers directly (rather than booting a real `$fetch` instance) keeps
 * the test independent of ofetch's internals while covering the contract: the
 * tenant header is attached, the AC-016 hold is recovered centrally, there is no
 * redirect loop, and the handler never suppresses the error.
 */
function heldUser() {
  return {
    id: 'u1', name: 'Directora', email: 'd@c.com', companyId: 'c1',
    roles: [], permissions: [],
  };
}

describe('api plugin interceptors', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(navigateTo).mockClear();
    // Land on a neutral route so the loop-guard is not accidentally satisfied.
    window.history.replaceState({}, '', '/materials');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('onRequest → applySubdomainHeader', () => {
    it('attaches x-subdomain to the request options', () => {
      const options: { headers?: HeadersInit } = {};
      applySubdomainHeader(options, 'acme');
      expect(new Headers(options.headers).get('x-subdomain')).toBe('acme');
    });

    it('overwrites any header a caller may have set by hand', () => {
      const options: { headers?: HeadersInit } = { headers: { 'x-subdomain': 'stale' } };
      applySubdomainHeader(options, 'fresh');
      expect(new Headers(options.headers).get('x-subdomain')).toBe('fresh');
    });
  });

  describe('onResponseError → handleApiResponseError (AC-016)', () => {
    it('marks the hold and redirects to change-password on 403 PASSWORD_CHANGE_REQUIRED', () => {
      const authStore = useAuthStore();
      authStore.user = heldUser();
      expect(authStore.forcePasswordReset).toBe(false);

      handleApiResponseError({ status: 403, _data: { code: 'PASSWORD_CHANGE_REQUIRED' } });

      expect(authStore.forcePasswordReset).toBe(true);
      expect(navigateTo).toHaveBeenCalledWith(CHANGE_PASSWORD_PATH);
    });

    it('does NOT navigate (no redirect loop) when already on the change-password page', () => {
      window.history.replaceState({}, '', CHANGE_PASSWORD_PATH);
      const authStore = useAuthStore();
      authStore.user = heldUser();

      handleApiResponseError({ status: 403, _data: { code: 'PASSWORD_CHANGE_REQUIRED' } });

      // The hold is still (re)marked, but the navigation is suppressed.
      expect(authStore.forcePasswordReset).toBe(true);
      expect(navigateTo).not.toHaveBeenCalled();
    });

    it('ignores an ordinary 403 without the PASSWORD_CHANGE_REQUIRED code', () => {
      const authStore = useAuthStore();
      authStore.user = heldUser();

      handleApiResponseError({ status: 403, _data: { message: 'Forbidden resource' } });

      expect(authStore.forcePasswordReset).toBe(false);
      expect(navigateTo).not.toHaveBeenCalled();
    });

    it('never throws nor suppresses: returns void so $fetch keeps rejecting and the caller still catches', () => {
      const authStore = useAuthStore();
      authStore.user = heldUser();

      // A void return (no thrown error, no returned Response) means ofetch does
      // not treat the error as handled — it re-throws to the caller's catch.
      let result: unknown;
      expect(() => {
        result = handleApiResponseError({ status: 403, _data: { code: 'PASSWORD_CHANGE_REQUIRED' } });
      }).not.toThrow();
      expect(result).toBeUndefined();
    });
  });
});
