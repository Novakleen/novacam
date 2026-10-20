import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPANYCAM_PROJECT_PAGE_SIZE,
  MAX_COMPANYCAM_PROJECT_PAGES,
  collectVisibleCompanyCamProjects,
  filterVisibleCompanyCamProjects,
  isArchivedCompanyCamProject,
} from './companycamProjects.js';

const active = (id, extra = {}) => ({
  id,
  name: `Projet ${id}`,
  status: 'active',
  archived: false,
  archived_at: null,
  ...extra,
});

test('CompanyCam archived boolean is the documented signal', () => {
  assert.equal(isArchivedCompanyCamProject(active('1', { archived: true })), true);
  assert.equal(isArchivedCompanyCamProject(active('2', { archived: 'true' })), true);
  assert.equal(isArchivedCompanyCamProject(active('3', { archived: false })), false);
  assert.equal(isArchivedCompanyCamProject(active('4')), false);
});

test('status archived and archived_at are excluded defensively', () => {
  assert.equal(
    isArchivedCompanyCamProject(active('1', { archived: false, status: 'archived' })),
    true
  );
  assert.equal(
    isArchivedCompanyCamProject(active('2', { archived: false, status: ' Archived ' })),
    true
  );
  assert.equal(
    isArchivedCompanyCamProject(active('3', { archived_at: 1_700_000_000 })),
    true
  );
  assert.equal(
    isArchivedCompanyCamProject(active('4', { archived_at: '2024-01-02T00:00:00Z' })),
    true
  );
  assert.equal(isArchivedCompanyCamProject(active('5', { archived_at: null })), false);
  assert.equal(isArchivedCompanyCamProject(active('6', { archived_at: 0 })), false);
  assert.equal(isArchivedCompanyCamProject(active('7', { archived_at: '' })), false);
  assert.equal(isArchivedCompanyCamProject(active('8', { status: 'deleted', archived: false })), false);
  assert.equal(isArchivedCompanyCamProject(null), false);
});

test('filter drops archived projects and keeps the others', () => {
  const visible = filterVisibleCompanyCamProjects([
    active('a'),
    active('b', { archived: true }),
    active('c', { status: 'archived' }),
    active('d', { archived_at: 42 }),
    { id: 'e', name: 'Sans drapeau' },
  ]);
  assert.deepEqual(visible.map((project) => project.id), ['a', 'e']);
});

test('paging fills a visible page across archived rows and stops at the target', async () => {
  const pages = {
    1: [
      ...Array.from({ length: 20 }, (_, i) => active(`arch-${i}`, { archived: true })),
      ...Array.from({ length: 5 }, (_, i) => active(`keep-${i}`)),
    ],
    2: Array.from({ length: 25 }, (_, i) => active(`more-${i}`)),
    3: Array.from({ length: 25 }, (_, i) => active(`later-${i}`)),
  };
  const requested = [];
  const result = await collectVisibleCompanyCamProjects({
    perPage: 25,
    targetCount: 25,
    fetchPage: async (page) => {
      requested.push(page);
      return pages[page] || [];
    },
  });

  assert.deepEqual(requested, [1, 2]);
  assert.equal(result.exhausted, false);
  assert.equal(result.nextPage, 3);
  assert.equal(result.projects.length, 30);
  assert.equal(result.projects.some(isArchivedCompanyCamProject), false);
  assert.equal(result.projects[0].id, 'keep-0');
  assert.equal(result.projects[5].id, 'more-0');
});

test('a short page ends the list even when the target is not met', async () => {
  const requested = [];
  const result = await collectVisibleCompanyCamProjects({
    perPage: COMPANYCAM_PROJECT_PAGE_SIZE,
    targetCount: 25,
    fetchPage: async (page) => {
      requested.push(page);
      if (page === 1) {
        return [
          active('1', { archived: true }),
          active('2'),
          active('3', { archived_at: 99 }),
        ];
      }
      return [active('should-not-fetch')];
    },
  });

  assert.deepEqual(requested, [1]);
  assert.equal(result.exhausted, true);
  assert.equal(result.nextPage, null);
  assert.deepEqual(result.projects.map((project) => project.id), ['2']);
});

test('paging is bounded when every page is full of archived projects', async () => {
  let calls = 0;
  const result = await collectVisibleCompanyCamProjects({
    perPage: 25,
    targetCount: 25,
    maxPages: MAX_COMPANYCAM_PROJECT_PAGES,
    fetchPage: async (page) => {
      calls += 1;
      return Array.from({ length: 25 }, (_, i) =>
        active(`p-${page}-${i}`, { archived: true })
      );
    },
  });

  assert.equal(calls, MAX_COMPANYCAM_PROJECT_PAGES);
  assert.equal(result.projects.length, 0);
  assert.equal(result.exhausted, false);
  assert.equal(result.nextPage, 1 + MAX_COMPANYCAM_PROJECT_PAGES);
});

test('duplicate ids are not repeated while filling the page', async () => {
  const result = await collectVisibleCompanyCamProjects({
    perPage: 2,
    targetCount: 2,
    fetchPage: async (page) => {
      if (page === 1) return [active('1', { archived: true }), active('2')];
      return [active('2'), active('3')];
    },
  });

  assert.deepEqual(result.projects.map((project) => project.id), ['2', '3']);
  assert.equal(result.nextPage, 3);
});
