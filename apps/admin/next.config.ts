import path from 'node:path';
import type { NextConfig } from 'next';

/**
 * Admin Web talks to the API through its own origin: `/admin/v1/*` is proxied to the API, so the
 * `__Host-` session cookie belongs to Admin Web and every mutation carries its Origin (ADR-009).
 */
const apiOrigin = new URL(process.env.DOKTOOL_API_ORIGIN ?? 'http://localhost:3000').origin;
/** Where signed URLs point: R2 endpoints in production, the API itself with the local driver. */
const storageOrigins = (process.env.DOKTOOL_STORAGE_ORIGINS ?? apiOrigin)
  .split(/\s+/)
  .filter(Boolean)
  .map((value) => new URL(value).origin)
  .join(' ');
const development = process.env.NODE_ENV !== 'production';
const repoRoot = path.join(import.meta.dirname, '..', '..');

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${storageOrigins}`,
  "font-src 'self'",
  `connect-src 'self' ${storageOrigins}${development ? ' ws:' : ''}`,
  "worker-src 'self' blob:",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  turbopack: { root: repoRoot },
  outputFileTracingRoot: repoRoot,
  async rewrites() {
    return {
      beforeFiles: [{ source: '/admin/v1/:path*', destination: `${apiOrigin}/admin/v1/:path*` }],
      afterFiles: [],
      fallback: [],
    };
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
    ];
  },
};

export default config;
