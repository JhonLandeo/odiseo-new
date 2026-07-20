/**
 * CLS key the correlation id is stored under. Deliberately a plain string
 * (not a Symbol/enum) to match this codebase's existing CLS convention — see
 * `cls.get('companyId')` / `cls.get('tenantSchema')` in tenant.middleware.ts.
 */
export const REQUEST_ID_CLS_KEY = 'requestId';

/**
 * Header a caller may supply the id on, and the header it is echoed back on.
 * Lowercase because Node's http headers object is already lowercased.
 */
export const REQUEST_ID_HEADER = 'x-request-id';
