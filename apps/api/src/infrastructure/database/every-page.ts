/** The keyset filter of the next page: rows whose id comes after the last one read. */
export type AfterId = { id?: { gt: string } };

/**
 * Runs `handle` on every row a recurring job has to process, one page at a time, ordered by id.
 * `readPage` must spread `after` into its `where` and order by `id` ascending.
 *
 * A job that reads a single page stops at that page for good when the rows it has already dealt
 * with still match the query (reminders already sent, checkouts still pending): they fill the page
 * on every run and the rows behind them are never reached. Paging by id reaches every row once per
 * run, whatever `handle` changes.
 */
export async function everyPage<Row extends { id: string }>(
  readPage: (after: AfterId) => Promise<Row[]>,
  handle: (row: Row) => Promise<void>,
): Promise<number> {
  let handled = 0;
  let after: AfterId = {};
  for (;;) {
    const page = await readPage(after);
    for (const row of page) await handle(row);
    handled += page.length;
    const last = page.at(-1);
    if (!last) return handled;
    after = { id: { gt: last.id } };
  }
}
