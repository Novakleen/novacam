/** PostgREST `db-max-rows` default. A full page means a later page may exist. */
export const TRESO_PAGE_SIZE = 1000;

/**
 * Read every row of a select. `.range()` is inclusive and, without a unique
 * order, can skip or repeat rows. `buildQuery` must return a fresh builder
 * each call (filters included); this applies the order and the page.
 */
export async function selectAll(buildQuery, { pageSize = TRESO_PAGE_SIZE, orderBy = 'id' } = {}) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await buildQuery().order(orderBy, { ascending: true }).range(from, to);
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}
