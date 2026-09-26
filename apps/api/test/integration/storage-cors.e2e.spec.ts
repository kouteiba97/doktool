// Phase 16: the local storage driver answers Admin Web's cross-origin uploads and reads, like R2
// with its bucket CORS rules; other origins get no CORS headers.
import { describe, expect, it } from 'vitest';
import { TEST_ADMIN_ORIGIN } from '../support/env.js';
import { useTestApp } from './app.js';

const app = useTestApp();
const PATH = '/v1/storage/local/objects';

describe('local storage CORS', () => {
  it('lets Admin Web preflight a signed upload', async () => {
    const response = await app
      .http()
      .options(`${PATH}?token=x`)
      .set('Origin', TEST_ADMIN_ORIGIN)
      .set('Access-Control-Request-Method', 'PUT')
      .set('Access-Control-Request-Headers', 'content-type')
      .expect(204);
    expect(response.headers['access-control-allow-origin']).toBe(TEST_ADMIN_ORIGIN);
    expect(response.headers['access-control-allow-methods']).toContain('PUT');
    expect(response.headers['access-control-allow-headers']).toContain('Content-Type');
  });

  it('gives no CORS grant to another origin and still checks the signature', async () => {
    const response = await app
      .http()
      .get(`${PATH}?token=forged`)
      .set('Origin', 'https://elsewhere.example')
      .expect(403);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.headers['cross-origin-resource-policy']).toBe('cross-origin');
  });
});
