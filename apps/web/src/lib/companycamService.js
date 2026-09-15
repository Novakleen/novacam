import { supabase } from '@/lib/customSupabaseClient';

/**
 * Generic request wrapper for CompanyCam API via Supabase Edge Function
 * The Edge Function securely holds the COMPANYCAM_API_TOKEN in Supabase Secrets.
 * DO NOT put the API key in the frontend code.
 */
export const makeRequest = async (method, endpoint, data = null, params = {}) => {
  try {
    const { data: result, error } = await supabase.functions.invoke('companycam-proxy', {
      body: { method, endpoint, data, params }
    });
    
    if (error) throw new Error(error.message);
    if (result?.error) throw new Error(typeof result.error === 'string' ? result.error : JSON.stringify(result.error));
    
    return { success: true, data: result };
  } catch (error) {
    console.error(`CompanyCam API Error (${method} ${endpoint}):`, error);
    return { success: false, error: error.message };
  }
};

// Projects
// CompanyCam API uses per_page/page (not limit). Results are sorted by most recent activity first.
export const listProjects = (params = {}) => {
  const { limit, per_page, page, status, ...rest } = params;
  const normalized = {
    page: page ?? 1,
    per_page: per_page ?? limit ?? 25,
    status: status ?? 'active',
    ...rest,
  };
  return makeRequest('GET', '/projects', null, normalized);
};

const RECENT_PROJECTS_TTL_MS = 5 * 60 * 1000;
let recentProjectsCache = {
  data: null,
  fetchedAt: 0,
  promise: null,
};

const normalizeProjectList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.projects)) return payload.projects;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

/**
 * Fast path for UI pickers: returns the most recent active projects,
 * with an in-memory cache so reopening a form is instant.
 */
export const listRecentProjects = async ({ per_page = 25, force = false } = {}) => {
  const now = Date.now();
  if (
    !force &&
    recentProjectsCache.data &&
    now - recentProjectsCache.fetchedAt < RECENT_PROJECTS_TTL_MS
  ) {
    return { success: true, data: recentProjectsCache.data, fromCache: true };
  }

  if (!force && recentProjectsCache.promise) {
    return recentProjectsCache.promise;
  }

  const pending = makeRequest('GET', '/projects', null, {
    page: 1,
    per_page,
    status: 'active',
  })
    .then((res) => {
      if (!res.success) return res;
      const list = normalizeProjectList(res.data);
      recentProjectsCache.data = list;
      recentProjectsCache.fetchedAt = Date.now();
      return { success: true, data: list, fromCache: false };
    })
    .catch((error) => ({
      success: false,
      error: error.message || String(error),
    }))
    .finally(() => {
      if (recentProjectsCache.promise === pending) {
        recentProjectsCache.promise = null;
      }
    });

  recentProjectsCache.promise = pending;
  return pending;
};

/** Server-side name/address search (most relevant matches). */
export const searchProjects = async (query, { per_page = 25 } = {}) => {
  const q = String(query || '').trim();
  if (!q) return listRecentProjects({ per_page });
  const res = await makeRequest('GET', '/projects', null, {
    page: 1,
    per_page,
    status: 'active',
    query: q,
  });
  if (!res.success) return res;
  return { success: true, data: normalizeProjectList(res.data) };
};

/** Warm the recent-projects cache (e.g. when opening Time Tracker). */
export const prefetchRecentProjects = () => {
  listRecentProjects({ per_page: 25 }).catch(() => {});
};

export const getCachedRecentProjects = () => recentProjectsCache.data || [];

export const getProject = (id) => makeRequest('GET', `/projects/${id}`);
export const createProject = (data) => makeRequest('POST', '/projects', data);
export const updateProject = (id, data) => makeRequest('PUT', `/projects/${id}`, data);
export const deleteProject = (id) => makeRequest('DELETE', `/projects/${id}`);

// Photos/Media
export const listProjectPhotos = (projectId, params) => makeRequest('GET', `/projects/${projectId}/photos`, null, params);
export const getPhoto = (id) => makeRequest('GET', `/photos/${id}`);
export const updatePhoto = (id, data) => makeRequest('PUT', `/photos/${id}`, data);
export const deletePhoto = (id) => makeRequest('DELETE', `/photos/${id}`);
// Uploading photo natively might require a two-step process in CC (create photo, get URL, upload). 
// Here we proxy a basic payload.
export const uploadPhoto = (projectId, fileDataBase64, metadata) => 
  makeRequest('POST', `/projects/${projectId}/photos`, { ...metadata, file_data: fileDataBase64 });

// Users & Team Members
export const listTeamMembers = (params) => makeRequest('GET', '/users', null, params);
export const addTeamMember = (projectId, userId) => makeRequest('POST', `/projects/${projectId}/users`, { user_id: userId });
export const removeTeamMember = (projectId, userId) => makeRequest('DELETE', `/projects/${projectId}/users/${userId}`);

// Folders
export const listFolders = (projectId) => makeRequest('GET', `/projects/${projectId}/project_folders`);
export const createFolder = (projectId, data) => makeRequest('POST', `/projects/${projectId}/project_folders`, data);
export const updateFolder = (id, data) => makeRequest('PUT', `/project_folders/${id}`, data);
export const deleteFolder = (id) => makeRequest('DELETE', `/project_folders/${id}`);

// Tags (global company tags)
export const listTags = () => makeRequest('GET', '/tags');
export const createTag = (data) => makeRequest('POST', '/tags', data);
export const updateTag = (id, data) => makeRequest('PUT', `/tags/${id}`, data);
export const deleteTag = (id) => makeRequest('DELETE', `/tags/${id}`);

// Project Labels (CompanyCam "tags" shown on projects — display_value)
export const listProjectLabels = (projectId, params = {}) =>
  makeRequest('GET', `/projects/${projectId}/labels`, null, {
    page: params.page ?? 1,
    per_page: params.per_page ?? 50,
  });

/** Normalize label/tag payloads from CompanyCam into display strings. */
export const normalizeCcTagNames = (payload) => {
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.labels)
      ? payload.labels
      : Array.isArray(payload?.tags)
        ? payload.tags
        : Array.isArray(payload?.data)
          ? payload.data
          : [];
  return list
    .map((t) => {
      if (!t) return null;
      if (typeof t === 'string') return t;
      return t.display_value || t.name || t.value || null;
    })
    .filter(Boolean);
};

// Comments
export const listComments = (photoId) => makeRequest('GET', `/photos/${photoId}/comments`);
export const createComment = (photoId, data) => makeRequest('POST', `/photos/${photoId}/comments`, data);
export const deleteComment = (id) => makeRequest('DELETE', `/comments/${id}`);