/**
 * CompanyCam GET /projects?status=active returns projects that are not deleted.
 * Archived projects are still included. The Project schema marks them with
 * `archived: true` (https://docs.companycam.com OpenAPI, Project.archived).
 * `status` is documented as active | deleted, and there is no archived_at field.
 * Callers also treat `status === 'archived'` and a non-null `archived_at`
 * as archived so a payload change does not put those projects back in the UI.
 */

export const COMPANYCAM_PROJECT_PAGE_SIZE = 25;

/** Extra pages scanned when archived rows shrink a page. Caps one load. */
export const MAX_COMPANYCAM_PROJECT_PAGES = 8;

const hasArchivedTimestamp = (value) => {
  if (value == null || value === false) return false;
  if (typeof value === 'number') return Number.isFinite(value) && value > 0;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed === '0' || trimmed.toLowerCase() === 'null') return false;
    return true;
  }
  return false;
};

/** True when the project should be hidden from dashboard lists and pickers. */
export const isArchivedCompanyCamProject = (project) => {
  if (!project || typeof project !== 'object') return false;
  if (project.archived === true || project.archived === 'true') return true;
  const status = typeof project.status === 'string' ? project.status.trim().toLowerCase() : '';
  if (status === 'archived') return true;
  if (hasArchivedTimestamp(project.archived_at)) return true;
  return false;
};

export const filterVisibleCompanyCamProjects = (projects) => {
  if (!Array.isArray(projects)) return [];
  return projects.filter((project) => !isArchivedCompanyCamProject(project));
};

/**
 * Keep requesting pages until `targetCount` visible projects are collected,
 * a page is shorter than `perPage` (end of the list), or `maxPages` is hit.
 * A full raw page is kept even when it pushes the visible count past the target,
 * so the next request can start at the following page without skipping rows.
 *
 * @param {{
 *   fetchPage: (page: number) => Promise<unknown>,
 *   startPage?: number,
 *   perPage?: number,
 *   targetCount?: number,
 *   maxPages?: number,
 * }} options
 * @returns {Promise<{ projects: object[], nextPage: number|null, pagesFetched: number, exhausted: boolean }>}
 */
export const collectVisibleCompanyCamProjects = async ({
  fetchPage,
  startPage = 1,
  perPage = COMPANYCAM_PROJECT_PAGE_SIZE,
  targetCount = perPage,
  maxPages = MAX_COMPANYCAM_PROJECT_PAGES,
} = {}) => {
  if (typeof fetchPage !== 'function') {
    throw new Error('fetchPage is required');
  }

  const size = Math.max(1, Number(perPage) || COMPANYCAM_PROJECT_PAGE_SIZE);
  const target = Math.max(1, Number(targetCount) || size);
  const pageCap = Math.max(1, Number(maxPages) || MAX_COMPANYCAM_PROJECT_PAGES);
  const visible = [];
  const seen = new Set();
  let page = Math.max(1, Number(startPage) || 1);
  let pagesFetched = 0;

  while (pagesFetched < pageCap && visible.length < target) {
    const raw = await fetchPage(page);
    const list = Array.isArray(raw) ? raw : [];
    pagesFetched += 1;

    for (const project of list) {
      if (isArchivedCompanyCamProject(project)) continue;
      const key = project && project.id != null ? String(project.id) : null;
      if (key) {
        if (seen.has(key)) continue;
        seen.add(key);
      }
      visible.push(project);
    }

    if (list.length < size) {
      return { projects: visible, nextPage: null, pagesFetched, exhausted: true };
    }

    page += 1;
    if (visible.length >= target) {
      return { projects: visible, nextPage: page, pagesFetched, exhausted: false };
    }
  }

  return { projects: visible, nextPage: page, pagesFetched, exhausted: false };
};
