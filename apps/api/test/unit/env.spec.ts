import { describe, expect, it } from 'vitest';
import { InvalidEnvironmentError, loadEnv } from '../../src/config/env.js';

describe('loadEnv', () => {
  it('applies defaults and coerces the port', () => {
    expect(loadEnv({ DATABASE_URL: 'postgresql://u@localhost:5432/db', PORT: '8080' })).toEqual({
      NODE_ENV: 'development',
      PORT: 8080,
      DATABASE_URL: 'postgresql://u@localhost:5432/db',
    });
  });

  it('refuses to start without a database URL', () => {
    expect(() => loadEnv({})).toThrow(InvalidEnvironmentError);
  });

  it('refuses a non-PostgreSQL URL', () => {
    expect(() => loadEnv({ DATABASE_URL: 'mysql://u@localhost/db' })).toThrow(/PostgreSQL URL/);
  });

  it('refuses an unknown NODE_ENV and an out-of-range port', () => {
    const attempt = () =>
      loadEnv({ DATABASE_URL: 'postgres://u@h/db', NODE_ENV: 'staging', PORT: '70000' });
    expect(attempt).toThrow(InvalidEnvironmentError);
    try {
      attempt();
    } catch (error) {
      expect((error as InvalidEnvironmentError).issues).toHaveLength(2);
    }
  });
});
