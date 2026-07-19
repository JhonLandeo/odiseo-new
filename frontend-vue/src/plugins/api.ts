import { defineNuxtPlugin } from '#app'
import { useAuthStore } from '@/stores/auth.store'
import { handlePasswordChangeRequired } from '@/core/auth/password-change-required'

/**
 * The single HTTP client for the whole SPA.
 *
 * Historically every call was a bare `$fetch` that had to remember two things by
 * hand: the tenant `x-subdomain` header (forgetting it breaks tenant resolution
 * on localhost) and the AC-016 password-hold recovery (only one store opted in).
 * Both concerns now live here, once, so no call site can drift.
 *
 * Paths stay fully qualified (`/api/v1/...`), so there is deliberately no
 * `baseURL`: the final URLs the backend sees are byte-for-byte what they were.
 * Auth still travels in the httpOnly cookie; requests are same-origin (the Nuxt
 * dev proxy fronts `/api`), so the browser attaches it under the default
 * `credentials` policy — nothing to set.
 */

/**
 * Attaches the tenant subdomain header, overwriting any stale value. Exported so
 * the interceptor's behaviour is unit-testable without booting the plugin.
 */
export function applySubdomainHeader(
  options: { headers?: HeadersInit },
  subdomain: string,
): void {
  const headers = new Headers(options.headers)
  headers.set('x-subdomain', subdomain)
  options.headers = headers
}

/**
 * Central AC-016 recovery. Reuses the shared helper (no duplicated logic): it
 * marks the store hold and, unless we are already on the change-password page,
 * navigates there. The helper's own guard (`pathname !== CHANGE_PASSWORD_PATH`)
 * prevents a redirect loop, and it only acts on a `403 PASSWORD_CHANGE_REQUIRED`,
 * so an ordinary permission `403` passes straight through. Returns nothing and
 * never suppresses the error — `$fetch` still rejects, so callers still `catch`.
 */
export function handleApiResponseError(response: {
  status: number
  _data?: unknown
}): void {
  handlePasswordChangeRequired({ status: response.status, data: response._data })
}

export default defineNuxtPlugin((nuxtApp) => {
  const api = $fetch.create({
    onRequest({ options }) {
      // `runWithContext` keeps `getSubdomain()` valid on the server, where it
      // reads the request host header via `useRequestHeaders`.
      const subdomain = nuxtApp.runWithContext(() => useAuthStore().getSubdomain()) as string
      applySubdomainHeader(options, subdomain)
    },
    onResponseError({ response }) {
      // `navigateTo`/`useAuthStore` inside an interceptor run outside a component
      // tick, so restore the Nuxt context before touching either.
      nuxtApp.runWithContext(() => handleApiResponseError(response))
    },
  })

  return { provide: { api } }
})
