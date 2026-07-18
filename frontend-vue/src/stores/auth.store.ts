import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { useRequestHeaders } from '#app';

export interface Branding {
  commercialName: string;
  logoUrl?: string;
  primaryColor?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  companyId: string;
  roles: string[];
  permissions: string[];
  /**
   * Backend hold flag (AC-016). While true the API rejects every authenticated
   * request except `auth/me`, `auth/logout` and `auth/change-password` with a
   * 403 carrying `code: "PASSWORD_CHANGE_REQUIRED"`.
   */
  forcePasswordReset?: boolean;
}

/**
 * Discriminated outcome of `changePassword`. The three failure reasons are kept
 * apart on purpose: "your current password is wrong", "your new password breaks
 * the policy" and "you are going too fast" need different user actions.
 */
export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; reason: 'invalid-current-password' | 'weak-password' | 'rate-limited' | 'unknown' };

/** Minimum new-password length. Mirrors the backend rule exactly — do not tighten. */
export const PASSWORD_MIN_LENGTH = 8;

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const branding = ref<Branding | null>(null);
  const isAuthenticated = ref(false);
  const isInitialized = ref(false);

  /**
   * Derived rather than stored: `login` and `fetchMe` both replace `user`, so a
   * separate ref would only add a way for the two to drift apart.
   */
  const forcePasswordReset = computed(() => user.value?.forcePasswordReset === true);

  const API_BASE = '/api';

  function getSubdomain() {
    if (typeof window !== 'undefined') {
      const host = window.location.hostname;
      const parts = host.split('.');
      if (parts.length >= 2 && parts[0] !== 'www' && parts[0] !== 'localhost') {
        return parts[0];
      }
    } else {
      // Server-side: extract subdomain from request host header
      const headers = useRequestHeaders(['host']);
      const host = headers.host || '';
      const parts = host.split('.');
      if (parts.length >= 2 && parts[0] !== 'www' && parts[0] !== 'localhost') {
        return parts[0];
      }
    }
    return 'odiseo';
  }

  async function fetchBranding(subdomainParam?: string) {
    const subdomain = subdomainParam || getSubdomain();
    try {
      const data = await $fetch<Branding>(`${API_BASE}/v1/tenants/branding?subdomain=${subdomain}`);
      branding.value = data;
    } catch (error) {
      console.error('Failed to fetch branding', error);
    }
  }

  async function login(credentials: any, subdomainParam?: string) {
    const subdomain = subdomainParam || getSubdomain();
    try {
      const response = await $fetch<{ user: User }>(`${API_BASE}/v1/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-subdomain': subdomain,
        },
        body: { ...credentials, subdomain },
      });
      
      if (response && response.user) {
        user.value = response.user;
        isAuthenticated.value = true;
        return true;
      }
      return false;
    } catch (error) {
      console.error('Login failed:', error);
      return false;
    }
  }

  async function fetchMe() {
    const subdomain = getSubdomain();
    const reqHeaders = typeof process !== 'undefined' && process.server ? useRequestHeaders(['cookie']) : {};
    
    const headers: Record<string, string> = {
      'x-subdomain': subdomain,
      ...(reqHeaders as Record<string, string>),
    };

    try {
      const response = await $fetch<{ user: User }>(`${API_BASE}/v1/auth/me`, {
        method: 'GET',
        headers,
      });
      if (response && response.user) {
        user.value = response.user;
        isAuthenticated.value = true;
        return;
      }
      user.value = null;
      isAuthenticated.value = false;
    } catch (error) {
      user.value = null;
      isAuthenticated.value = false;
    } finally {
      isInitialized.value = true;
    }
  }

  /**
   * Changes the password of the current session.
   *
   * The endpoint answers `204 No Content`, so there is no body to read the new
   * session state from. We call `fetchMe()` on success to re-read the user from
   * the server: that is the only authority on whether the hold was lifted, and
   * it keeps `forcePasswordReset` honest instead of optimistically clearing a
   * flag the backend still holds (which would bounce the user into a redirect
   * loop against the middleware).
   */
  async function changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<ChangePasswordResult> {
    const subdomain = getSubdomain();
    try {
      await $fetch(`${API_BASE}/v1/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-subdomain': subdomain,
        },
        body: { currentPassword, newPassword },
      });
    } catch (error) {
      const status = (error as { status?: number; statusCode?: number })?.status
        ?? (error as { statusCode?: number })?.statusCode;

      if (status === 401) return { ok: false, reason: 'invalid-current-password' };
      if (status === 400) return { ok: false, reason: 'weak-password' };
      if (status === 429) return { ok: false, reason: 'rate-limited' };
      return { ok: false, reason: 'unknown' };
    }

    // 204 => success. Re-read the session so the hold visibly lifts.
    await fetchMe();
    return { ok: true };
  }

  /**
   * Escape hatch for stale state: a `403 PASSWORD_CHANGE_REQUIRED` from any
   * endpoint proves the server still holds this user even if our copy says
   * otherwise. Flips the local flag so the global middleware takes over on the
   * next navigation.
   */
  function markPasswordChangeRequired() {
    if (user.value) {
      user.value = { ...user.value, forcePasswordReset: true };
    }
  }

  async function logout() {
    user.value = null;
    isAuthenticated.value = false;

    const subdomain = getSubdomain();
    try {
      await $fetch(`${API_BASE}/v1/auth/logout`, {
        method: 'POST',
        headers: {
          'x-subdomain': subdomain,
        },
      });
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
  }

  function hasPermission(permission: string): boolean {
    return user.value?.permissions?.includes(permission) || false;
  }

  function hasRole(role: string): boolean {
    return user.value?.roles?.includes(role) || false;
  }

  return {
    user,
    branding,
    isAuthenticated,
    isInitialized,
    forcePasswordReset,
    fetchBranding,
    login,
    fetchMe,
    logout,
    changePassword,
    markPasswordChangeRequired,
    hasPermission,
    hasRole,
    getSubdomain,
  };
});
