import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attachMarginSnapshot,
  filterDashboardProjects,
  projectHasMargin,
  resetDashboardFilters,
} from './dashboardProjectFilters.js';

const row = (overrides) => ({
  id: overrides.id,
  name: overrides.name || overrides.id,
  source: overrides.source || 'novacam',
  is_archived: overrides.is_archived === true,
  companycam_project_id: overrides.companycam_project_id || null,
  stats: overrides.stats,
});

const withMargin = (id, source = 'novacam', extra = {}) =>
  row({
    id,
    source,
    stats: { ma_pct: 0.42, ma: 1250 },
    ...extra,
  });

const withoutMargin = (id, source = 'novacam', extra = {}) =>
  row({
    id,
    source,
    stats: { ma_pct: null, ma: null },
    ...extra,
  });

const projects = [
  withMargin('nova-active', 'novacam'),
  withoutMargin('nova-plain', 'novacam'),
  withMargin('cc-active', 'companycam'),
  withoutMargin('cc-plain', 'companycam'),
  withMargin('nova-arch', 'novacam', { is_archived: true }),
  withoutMargin('nova-arch-plain', 'novacam', { is_archived: true }),
  withMargin('cc-arch', 'companycam', { is_archived: true, companycam_project_id: '88' }),
  withoutMargin('cc-arch-plain', 'companycam', { is_archived: true, companycam_project_id: '89' }),
];

const ids = (list) => list.map((project) => project.id);

test('margin data is a finite MA percent and a finite euro amount', () => {
  assert.equal(projectHasMargin(withMargin('a')), true);
  assert.equal(projectHasMargin(row({ id: 'zero', stats: { ma_pct: 0, ma: 0 } })), true);
  assert.equal(projectHasMargin(row({ id: 'pct', stats: { ma_pct: '0.2', ma: '10' } })), true);
  assert.equal(projectHasMargin(row({ id: 'no-eur', stats: { ma_pct: 0.3, ma: null } })), false);
  assert.equal(projectHasMargin(row({ id: 'no-pct', stats: { ma_pct: null, ma: 10 } })), false);
  assert.equal(projectHasMargin(row({ id: 'empty', stats: { ma_pct: '', ma: '' } })), false);
  assert.equal(projectHasMargin(row({ id: 'bad', stats: { ma_pct: 'nope', ma: 10 } })), false);
  assert.equal(projectHasMargin({ id: 'top', ma_pct: 0.5, ma: 20 }), true);
  assert.equal(projectHasMargin(null), false);
});

test('margin filter combines with Tous, Novacam and CompanyCam on Actifs', () => {
  assert.deepEqual(
    ids(filterDashboardProjects(projects, { source: 'all', tab: 'active', withMargin: true })),
    ['nova-active', 'cc-active']
  );
  assert.deepEqual(
    ids(filterDashboardProjects(projects, { source: 'novacam', tab: 'active', withMargin: true })),
    ['nova-active']
  );
  assert.deepEqual(
    ids(filterDashboardProjects(projects, { source: 'companycam', tab: 'active', withMargin: true })),
    ['cc-active']
  );
  assert.deepEqual(
    ids(filterDashboardProjects(projects, { source: 'companycam', tab: 'active', withMargin: false })),
    ['cc-active', 'cc-plain']
  );
});

test('margin filter combines with source on the Archivés tab', () => {
  assert.deepEqual(
    ids(filterDashboardProjects(projects, { source: 'all', tab: 'archived', withMargin: true })),
    ['nova-arch', 'cc-arch']
  );
  assert.deepEqual(
    ids(filterDashboardProjects(projects, { source: 'novacam', tab: 'archived', withMargin: true })),
    ['nova-arch']
  );
  assert.deepEqual(
    ids(filterDashboardProjects(projects, { source: 'companycam', tab: 'archived', withMargin: true })),
    ['cc-arch']
  );
  assert.deepEqual(
    ids(filterDashboardProjects(projects, { source: 'all', tab: 'archived', withMargin: false })),
    ['nova-arch', 'nova-arch-plain', 'cc-arch', 'cc-arch-plain']
  );
});

test('reset clears the margin filter and the other dashboard filters', () => {
  const narrowed = filterDashboardProjects(projects, {
    source: 'novacam',
    tab: 'active',
    withMargin: true,
  });
  assert.deepEqual(ids(narrowed), ['nova-active']);

  const cleared = resetDashboardFilters();
  assert.deepEqual(cleared, {
    sourceFilter: 'all',
    selectedTags: [],
    searchQuery: '',
    withMargin: false,
  });

  const restored = filterDashboardProjects(projects, {
    source: cleared.sourceFilter,
    tab: 'active',
    withMargin: cleared.withMargin,
  });
  assert.deepEqual(ids(restored), ['nova-active', 'nova-plain', 'cc-active', 'cc-plain']);
});

test('archived rows pick up margin snapshots before the filter', () => {
  const archived = attachMarginSnapshot(
    {
      id: 'db-1',
      is_archived: true,
      source: 'novacam',
      companycam_project_id: null,
    },
    { 'db-1': { ma: 640.5, ma_pct: 0.31 } },
    {}
  );
  const linked = attachMarginSnapshot(
    {
      id: 'db-2',
      is_archived: true,
      source: 'companycam',
      companycam_project_id: '555',
    },
    {},
    { 555: { ma: 80, ma_pct: 0.11 } }
  );
  const untouched = attachMarginSnapshot(
    { id: 'db-3', is_archived: true, source: 'novacam' },
    {},
    {}
  );

  assert.equal(projectHasMargin(archived), true);
  assert.equal(projectHasMargin(linked), true);
  assert.equal(projectHasMargin(untouched), false);
  assert.deepEqual(
    ids(filterDashboardProjects([archived, linked, untouched], {
      source: 'all',
      tab: 'archived',
      withMargin: true,
    })),
    ['db-1', 'db-2']
  );
});
