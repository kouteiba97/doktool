import { type NextRequest, NextResponse } from 'next/server';

// Kept in sync with session/session.ts (the proxy cannot import client modules).
const SESSION_COOKIE = '__Host-doktool_admin';

/**
 * Console pages need an admin session cookie; without one the browser goes to sign-in first.
 * The API still validates the session on every call — this only avoids rendering a shell.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = '/sign-in';
  url.search = `?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

/** Which URLs the proxy runs on: every console page, never the API. */
export const config = {
  // `/admin/v1/*` is the proxied API, never a page.
  matcher: ['/admin', '/admin/((?!v1(?:/|$)).*)'],
};
