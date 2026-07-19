import { useNuxtApp } from '#app'
import type { $Fetch } from 'ofetch'

/**
 * Central HTTP client for the SPA. Returns the `$fetch` instance provided by the
 * `api` plugin, which:
 *  - attaches the tenant `x-subdomain` header on every request (see the plugin's
 *    `onRequest`), so no call site has to remember it;
 *  - recovers centrally from the AC-016 password hold (`403
 *    PASSWORD_CHANGE_REQUIRED`) via `onResponseError`;
 *  - rejects on 4xx/5xx exactly like a bare `$fetch`, exposing the parsed body on
 *    `error.data` so callers keep reading `error.data.message` / snake_case fields.
 *
 * Call it at the top of a store action (before the first `await`) so the Nuxt
 * app context is still active when it resolves the instance.
 */
export function useApi(): $Fetch {
  return useNuxtApp().$api as $Fetch
}
