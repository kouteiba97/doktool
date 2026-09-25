// Shared helpers for integration tests against a migrated PostgreSQL database.
// Every test runs inside a transaction that is rolled back, so the database is left untouched
// (the append-only audit table could not be cleaned any other way).
import pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, expect } from 'vitest';

export function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'Integration tests need DATABASE_URL (a migrated database). Set it in apps/api/.env or the environment, ' +
        'then run `npm run prisma:migrate:deploy -w @doktool/api`.',
    );
  }
  return url;
}

export interface TestDatabase {
  query<Row extends pg.QueryResultRow = pg.QueryResultRow>(
    sql: string,
    params?: unknown[],
  ): Promise<pg.QueryResult<Row>>;
  /** Runs `sql` and asserts PostgreSQL rejects it with an error matching `pattern`. */
  expectRejection(sql: string, params: unknown[], pattern: RegExp): Promise<void>;
  /** Inserts a row and returns its id. */
  insertId(sql: string, params?: unknown[]): Promise<string>;
}

/** Registers hooks that open one connection per file and wrap each test in BEGIN … ROLLBACK. */
export function useTestDatabase(): TestDatabase {
  const client = new pg.Client({ connectionString: requireDatabaseUrl() });
  let savepoint = 0;

  beforeAll(async () => {
    await client.connect();
  });
  afterAll(async () => {
    await client.end();
  });
  beforeEach(async () => {
    await client.query('BEGIN');
  });
  afterEach(async () => {
    await client.query('ROLLBACK');
  });

  return {
    query: (sql, params) => client.query(sql, params),

    async expectRejection(sql, params, pattern) {
      const name = `sp_${++savepoint}`;
      await client.query(`SAVEPOINT ${name}`);
      let failure: unknown = null;
      try {
        await client.query(sql, params);
      } catch (error) {
        failure = error;
      }
      await client.query(`ROLLBACK TO SAVEPOINT ${name}`);
      expect(failure, `expected PostgreSQL to reject: ${sql}`).toBeInstanceOf(Error);
      expect((failure as Error).message).toMatch(pattern);
    },

    async insertId(sql, params) {
      const result = await client.query<{ id: string }>(sql, params);
      const id = result.rows[0]?.id;
      if (!id) throw new Error(`insert returned no id: ${sql}`);
      return id;
    },
  };
}
