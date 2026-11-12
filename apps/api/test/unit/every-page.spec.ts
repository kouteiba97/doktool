import { describe, expect, it } from 'vitest';
import { type AfterId, everyPage } from '../../src/infrastructure/database/every-page.js';

/** Twelve rows read three at a time, as a recurring job would read them. */
function table(size: number, pageSize: number) {
  const rows = Array.from({ length: size }, (_, index) => ({ id: String(index).padStart(3, '0') }));
  const reads: AfterId[] = [];
  const readPage = (after: AfterId) => {
    reads.push(after);
    const from = after.id ? rows.findIndex((row) => row.id > after.id!.gt) : 0;
    return Promise.resolve(from < 0 ? [] : rows.slice(from, from + pageSize));
  };
  return { rows, reads, readPage };
}

describe('everyPage', () => {
  it('reaches every row once, even when handled rows still match the query', async () => {
    // Reminders already sent stay in the result: a single page would return the same rows forever.
    const { rows, readPage } = table(12, 5);
    const seen: string[] = [];
    const handled = await everyPage(readPage, (row) => {
      seen.push(row.id);
      return Promise.resolve();
    });
    expect(handled).toBe(12);
    expect(seen).toEqual(rows.map((row) => row.id));
  });

  it('asks for the page after the last id read, and stops on an empty page', async () => {
    const { reads, readPage } = table(4, 2);
    await everyPage(readPage, () => Promise.resolve());
    expect(reads).toEqual([{}, { id: { gt: '001' } }, { id: { gt: '003' } }]);
  });

  it('does nothing on an empty table', async () => {
    const { readPage } = table(0, 5);
    expect(await everyPage(readPage, () => Promise.reject(new Error('never called')))).toBe(0);
  });
});
