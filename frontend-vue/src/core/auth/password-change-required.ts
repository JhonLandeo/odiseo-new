/**
 * Defence in depth for the AC-016 password hold.
 *
 * The global middleware decides from store state, and store state can be stale:
 * an admin reset or another session can set `force_password_reset` after we
 * last called `auth/me`. When that happens every authenticated request starts
 * answering `403 { code: "PASSWORD_CHANGE_REQUIRED" }` while the SPA still
 * believes the user is free to browse.
 *
 * This codebase has no central HTTP client — every call is a bare `$fetch` — so
 * there is deliberately no interceptor here. Instead this module offers two
 * small functions that a `catch` block can opt into. See CHANGE_PASSWORD_PATH
 * consumers for the call sites that currently do.
 */
import { navigateTo } from '#app';
import { useAuthStore } from '@/stores/auth.store';

export const PASSWORD_CHANGE_REQUIRED_CODE = 'PASSWORD_CHANGE_REQUIRED';
export const CHANGE_PASSWORD_PATH = '/change-password';

/**
 * True when an error is the backend's password-hold rejection.
 *
 * The `code` discriminator is what separates this from an ordinary permission
 * denial: both are `403`, only this one carries the code.
 */
export function isPasswordChangeRequiredError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const err = error as {
    status?: number;
    statusCode?: number;
    data?: { code?: string };
    code?: string;
  };

  const status = err.status ?? err.statusCode;
  if (status !== 403) return false;

  // `$fetch` puts the parsed response body on `.data`; fall back to a bare
  // object in case a caller hands us the body itself.
  return (err.data?.code ?? err.code) === PASSWORD_CHANGE_REQUIRED_CODE;
}

/**
 * If `error` is the password-hold rejection, sync the store and send the user to
 * the change-password page. Returns true when it handled the error, so callers
 * can `if (handlePasswordChangeRequired(e)) return;` before their own reporting.
 */
export function handlePasswordChangeRequired(error: unknown): boolean {
  if (!isPasswordChangeRequiredError(error)) return false;

  const authStore = useAuthStore();
  authStore.markPasswordChangeRequired();

  if (typeof window !== 'undefined' && window.location.pathname !== CHANGE_PASSWORD_PATH) {
    navigateTo(CHANGE_PASSWORD_PATH);
  }
  return true;
}
