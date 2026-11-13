import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'X-Request-Id';

/** An Express request after {@link requestId} ran. */
export type IdentifiedRequest = Request & { requestId?: string };

/** What a proxy or a client may send as an id: short and plain, so it is safe to log. */
const ACCEPTABLE = /^[A-Za-z0-9._-]{8,64}$/;

/**
 * Gives every request an id, returned in `X-Request-Id` and written with every server error, so a
 * failure someone reports can be found in the logs. An id sent by the proxy in front of the API is
 * kept; anything else is replaced by a new one.
 */
export function requestId(request: IdentifiedRequest, response: Response, next: NextFunction) {
  const given = request.get(REQUEST_ID_HEADER);
  const id = given && ACCEPTABLE.test(given) ? given : randomUUID();
  request.requestId = id;
  response.setHeader(REQUEST_ID_HEADER, id);
  next();
}
