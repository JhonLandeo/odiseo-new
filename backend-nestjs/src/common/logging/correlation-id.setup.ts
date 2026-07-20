import { Request, Response } from 'express';
import { ClsService } from 'nestjs-cls';
import { v4 as uuidv4 } from 'uuid';
import {
  REQUEST_ID_CLS_KEY,
  REQUEST_ID_HEADER,
} from './correlation-id.constants';

/**
 * Wired into `ClsModule.forRoot({ middleware: { setup: ... } })`.
 *
 * Runs inside the CLS context nestjs-cls's own middleware already
 * established (see cls.middleware.ts: `setup` is awaited from inside
 * `cls.run(callback)`, before `next()` is called), so everything downstream
 * — TenantMiddleware, pino-http's request logging, guards, controllers —
 * observes the id set here through `cls.get(REQUEST_ID_CLS_KEY)`.
 *
 * A caller-supplied `x-request-id` is honored as-is (so a client-side error
 * report or support ticket can reference the exact id the client saw); one is
 * generated only when absent. Either way it is echoed back on the response so
 * the caller can capture it.
 */
export function setupCorrelationId(
  cls: ClsService,
  req: Request,
  res: Response,
): void {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const suppliedId = Array.isArray(incoming) ? incoming[0] : incoming;
  const requestId =
    suppliedId && suppliedId.trim().length > 0 ? suppliedId : uuidv4();

  cls.set(REQUEST_ID_CLS_KEY, requestId);
  res.setHeader(REQUEST_ID_HEADER, requestId);
}
