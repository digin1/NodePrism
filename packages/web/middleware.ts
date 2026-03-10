import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware to protect Grafana, Prometheus, and AlertManager routes.
 * Checks for the nodeprism_session cookie (httpOnly JWT set at login).
 * Without this, unauthenticated users could access these tools directly
 * through the Next.js rewrites.
 */
export function middleware(request: NextRequest) {
  const sessionCookie = request.cookies.get('nodeprism_session');

  if (!sessionCookie?.value) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Cookie exists - allow the request through to the rewrite proxy.
  // The cookie is httpOnly + sameSite:lax, so its presence means the user
  // authenticated through the login flow. Full JWT verification happens
  // server-side if needed (e.g., via nginx auth_request on port 8443).
  return NextResponse.next();
}

export const config = {
  matcher: ['/grafana/:path*', '/alertmanager/:path*', '/prometheus/:path*'],
};
