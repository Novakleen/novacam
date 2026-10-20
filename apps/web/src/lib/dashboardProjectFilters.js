/**
 * A project "has a margin" when the dashboard row can show the MA badge:
 * a finite MA % and a finite euro amount.
 */
export const isFiniteMarginValue = (value) => {
  if (value == null || value === '') return false;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n);
};

export const projectHasMargin = (project) => {
  const stats = project?.stats || {};
  const maPct = stats.ma_pct != null ? stats.ma_pct : project?.ma_pct;
  const ma = stats.ma != null ? stats.ma : project?.ma;
  return isFiniteMarginValue(maPct) && isFiniteMarginValue(ma);
};

export const attachMarginSnapshot = (project, marginByProject = {}, marginByCc = {}) => {
  if (!project) return project;
  const byProject = project.id != null ? marginByProject[project.id] : null;
  const ccId = project.companycam_project_id != null ? String(project.companycam_project_id) : '';
  const byCc = ccId ? marginByCc[ccId] : null;
  const margin = byProject || byCc;
  if (!margin) return project;
  return {
    ...project,
    stats: {
      ...(project.stats || {}),
      ma: margin.ma ?? project.stats?.ma ?? null,
      ma_pct: margin.ma_pct ?? project.stats?.ma_pct ?? null,
    },
  };
};

export const resetDashboardFilters = () => ({
  sourceFilter: 'all',
  selectedTags: [],
  searchQuery: '',
  withMargin: false,
});

/**
 * Combine the Vue d'ensemble source chips, the Actifs/Archivés tab, and the
 * margin toggle. Callers set `source` on each row before filtering.
 * Archived Novacam rows linked to CompanyCam should use source 'companycam'.
 */
export const filterDashboardProjects = (projects, {
  source = 'all',
  tab = 'active',
  withMargin = false,
} = {}) => {
  let list = Array.isArray(projects) ? projects : [];

  if (tab === 'archived') {
    list = list.filter((project) => project?.is_archived === true);
  } else if (tab === 'active') {
    list = list.filter((project) => project?.is_archived !== true);
  }

  if (source === 'novacam') {
    list = list.filter((project) => project?.source !== 'companycam');
  } else if (source === 'companycam') {
    list = list.filter((project) => project?.source === 'companycam');
  }

  if (withMargin) list = list.filter(projectHasMargin);
  return list;
};
