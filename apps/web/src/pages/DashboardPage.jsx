import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import {
  Plus,
  Search,
  FilterX,
  Loader2,
  Archive,
  RefreshCw,
  LayoutList,
} from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ProjectListRow from '@/components/projects/ProjectListRow';
import CreateProjectDialog from '@/components/projects/CreateProjectDialog';
import EditProjectDialog from '@/components/projects/EditProjectDialog';
import ArchivedProjectsSection from '@/components/projects/ArchivedProjectsSection';
import * as ccApi from '@/lib/companycamService';
import { enrichEntry } from '@/lib/timeTracking';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'dashboardFilters_v2';
const CC_PAGE_SIZE = 25;

const normalizeCcList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.projects)) return payload.projects;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

const extractCcPhotoUrl = (photo) => {
  if (!photo) return null;
  if (typeof photo.uri === 'string') return photo.uri;
  if (Array.isArray(photo.uris) && photo.uris.length) {
    const preferred =
      photo.uris.find((u) => u.type === 'thumbnail' || u.type === 'web') || photo.uris[0];
    return preferred?.url || preferred?.uri || null;
  }
  return photo.url || photo.thumbnail_url || photo.file_url || null;
};

const extractFeatureImage = (project) => {
  const fi = project.feature_image || project.featured_image;
  if (!fi) return null;
  if (typeof fi === 'string') return fi;
  if (Array.isArray(fi)) return extractCcPhotoUrl(fi[0]) || fi[0]?.url;
  return extractCcPhotoUrl(fi) || fi.url || null;
};

const DashboardPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const savedFilters = (() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
      return {};
    }
  })();

  const [novacamProjects, setNovacamProjects] = useState([]);
  const [ccProjects, setCcProjects] = useState([]);
  const [availableTags, setAvailableTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ccLoading, setCcLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [ccPage, setCcPage] = useState(1);
  const [ccHasMore, setCcHasMore] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState(savedFilters.sourceFilter || 'all');
  const [selectedTags, setSelectedTags] = useState(savedFilters.selectedTags || []);
  const [mainViewTab, setMainViewTab] = useState('active');

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingProject, setEditingProject] = useState(null);

  const statsRef = useRef({ timeByProject: {}, timeByCc: {}, sprayByProject: {}, sprayByCc: {} });
  const searchTimer = useRef(null);
  const debouncedSearchRef = useRef('');

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ sourceFilter, selectedTags })
    );
  }, [sourceFilter, selectedTags]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      const q = searchQuery.trim();
      debouncedSearchRef.current = q;
      setDebouncedSearch(q);
    }, 350);
    return () => clearTimeout(searchTimer.current);
  }, [searchQuery]);

  const loadTrackerStats = useCallback(async () => {
    const [timeRes, sprayRes] = await Promise.all([
      supabase
        .from('time_entries')
        .select('project_id, companycam_project_id, start_time, end_time, break_minutes'),
      supabase
        .from('spray_entries')
        .select('project_id, companycam_project_id, product_quantity, surface_m2'),
    ]);

    const timeByProject = {};
    const timeByCc = {};
    (timeRes.data || []).forEach((row) => {
      const enriched = enrichEntry(row);
      const h = enriched._hoursWorked || 0;
      if (row.project_id) {
        timeByProject[row.project_id] = (timeByProject[row.project_id] || 0) + h;
      }
      if (row.companycam_project_id) {
        const key = String(row.companycam_project_id);
        timeByCc[key] = (timeByCc[key] || 0) + h;
      }
    });

    const sprayByProject = {};
    const sprayByCc = {};
    (sprayRes.data || []).forEach((row) => {
      const qty = Number(row.product_quantity) || 0;
      const m2 = Number(row.surface_m2) || 0;
      if (row.project_id) {
        const cur = sprayByProject[row.project_id] || { product_qty: 0, surface_m2: 0 };
        cur.product_qty += qty;
        cur.surface_m2 += m2;
        sprayByProject[row.project_id] = cur;
      }
      if (row.companycam_project_id) {
        const key = String(row.companycam_project_id);
        const cur = sprayByCc[key] || { product_qty: 0, surface_m2: 0 };
        cur.product_qty += qty;
        cur.surface_m2 += m2;
        sprayByCc[key] = cur;
      }
    });

    statsRef.current = { timeByProject, timeByCc, sprayByProject, sprayByCc };
    return statsRef.current;
  }, []);

  const enrichNovacam = useCallback((rows, stats) => {
    const s = stats || statsRef.current;
    return (rows || []).map((p) => {
      const media = [...(p.media || [])].sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      );
      const photos = media.filter((m) => m.file_type !== 'video');
      const spray = s.sprayByProject[p.id] || { product_qty: 0, surface_m2: 0 };
      let hours = s.timeByProject[p.id] || 0;
      if (p.companycam_project_id) {
        hours += s.timeByCc[String(p.companycam_project_id)] || 0;
        const sprayCc = s.sprayByCc[String(p.companycam_project_id)] || {
          product_qty: 0,
          surface_m2: 0,
        };
        spray.product_qty += sprayCc.product_qty;
        spray.surface_m2 += sprayCc.surface_m2;
      }
      return {
        ...p,
        source: 'novacam',
        list_key: `nova-${p.id}`,
        thumbnail_url: photos[0]?.file_url || media[0]?.file_url || null,
        recent_photos: photos.slice(0, 4).map((m) => ({
          id: m.id,
          url: m.file_url,
          file_url: m.file_url,
        })),
        stats: {
          photos: photos.length,
          hours,
          product_qty: spray.product_qty,
          surface_m2: spray.surface_m2,
        },
      };
    });
  }, []);

  const enrichCc = useCallback((rows, stats) => {
    const s = stats || statsRef.current;
    return (rows || []).map((p) => {
      const idStr = String(p.id);
      const spray = s.sprayByCc[idStr] || { product_qty: 0, surface_m2: 0 };
      const hours = s.timeByCc[idStr] || 0;
      const feature = extractFeatureImage(p);
      const photoCount = p.photo_count ?? p.photos_count ?? p.image_count ?? 0;
      const existingRecent = p.recent_photos || [];
      return {
        ...p,
        source: 'companycam',
        list_key: `cc-${p.id}`,
        updated_at:
          p.updated_at ||
          (p.last_activity_at
            ? new Date(p.last_activity_at * 1000).toISOString()
            : null) ||
          (p.created_at
            ? typeof p.created_at === 'number'
              ? new Date(p.created_at * 1000).toISOString()
              : p.created_at
            : null),
        thumbnail_url: feature || existingRecent[0]?.url || null,
        recent_photos: existingRecent,
        stats: {
          photos: photoCount || existingRecent.length,
          hours,
          product_qty: spray.product_qty,
          surface_m2: spray.surface_m2,
        },
      };
    });
  }, []);

  const hydrateCcPhotos = useCallback(async (projects) => {
    const slice = projects.slice(0, 30);
    const results = await Promise.all(
      slice.map(async (p) => {
        if (p.recent_photos?.length) return p;
        try {
          const res = await ccApi.listProjectPhotos(p.id, { per_page: 4, page: 1 });
          if (!res.success) return p;
          const photos = normalizeCcList(res.data);
          const mapped = photos.slice(0, 4).map((ph) => ({
            id: ph.id,
            url: extractCcPhotoUrl(ph),
          }));
          return {
            ...p,
            recent_photos: mapped,
            thumbnail_url: p.thumbnail_url || mapped[0]?.url || null,
            stats: {
              ...p.stats,
              photos: p.stats?.photos || photos.length || mapped.length,
            },
          };
        } catch {
          return p;
        }
      })
    );
    const byId = Object.fromEntries(results.map((p) => [String(p.id), p]));
    return projects.map((p) => byId[String(p.id)] || p);
  }, []);

  /** Fetch real CompanyCam project labels (shown as tags in CC UI). */
  const hydrateCcLabels = useCallback(async (projects) => {
    const slice = projects.slice(0, 30);
    const results = await Promise.all(
      slice.map(async (p) => {
        const existing = Array.isArray(p.tags) ? p.tags : [];
        if (existing.length > 0) return p;
        try {
          const res = await ccApi.listProjectLabels(p.id, { per_page: 50, page: 1 });
          if (!res.success) return { ...p, tags: existing };
          const names = ccApi.normalizeCcTagNames(res.data);
          return { ...p, tags: names };
        } catch {
          return { ...p, tags: existing };
        }
      })
    );
    const byId = Object.fromEntries(results.map((p) => [String(p.id), p]));
    return projects.map((p) => byId[String(p.id)] || p);
  }, []);

  const fetchNovacam = useCallback(async (stats) => {
    const { data, error: qErr } = await supabase
      .from('projects')
      .select(
        `
          *,
          created_by_profile:profiles!created_by(full_name, initials),
          media(id, created_at, uploaded_by, file_url, file_type),
          project_members(user_id),
          project_tags(tag_id, tags(name)),
          project_contacts(
            contact_id,
            contacts(id, first_name, last_name, email, phone, hubspot_contact_id)
          )
        `
      )
      .eq('is_archived', false)
      .order('updated_at', { ascending: false });

    if (qErr) throw qErr;
    return enrichNovacam(data || [], stats);
  }, [enrichNovacam]);

  const fetchCcPage = useCallback(
    async (page, query, stats, append) => {
      const params = {
        page,
        per_page: CC_PAGE_SIZE,
        status: 'active',
      };
      if (query) params.query = query;

      const res = await ccApi.listProjects(params);
      if (!res.success) throw new Error(res.error || 'Échec chargement CompanyCam');

      let list = enrichCc(normalizeCcList(res.data), stats);

      // Map linked Supabase projects
      try {
        const ids = list.map((p) => String(p.id));
        if (ids.length) {
          const { data: linked } = await supabase
            .from('projects')
            .select('id, companycam_project_id, hubspot_contact_id')
            .in('companycam_project_id', ids);
          if (linked?.length) {
            const map = Object.fromEntries(
              linked.map((r) => [String(r.companycam_project_id), r])
            );
            list = list.map((p) => {
              const sb = map[String(p.id)];
              if (!sb) return p;
              return {
                ...p,
                supabase_id: sb.id,
                hubspot_contact_id: sb.hubspot_contact_id || p.hubspot_contact_id,
              };
            });
          }
        }
      } catch (e) {
        console.warn('CC→Supabase map failed', e);
      }

      list = await hydrateCcPhotos(list);
      list = await hydrateCcLabels(list);

      setCcHasMore(list.length >= CC_PAGE_SIZE);
      setCcPage(page);
      setCcProjects((prev) => {
        if (!append) return list;
        const seen = new Set(prev.map((p) => String(p.id)));
        return [...prev, ...list.filter((p) => !seen.has(String(p.id)))];
      });
      return list;
    },
    [enrichCc, hydrateCcPhotos, hydrateCcLabels]
  );

  const fetchAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const stats = await loadTrackerStats();
      const tagsPromise = supabase.from('tags').select('*').order('name');

      const needNova = sourceFilter === 'all' || sourceFilter === 'novacam';
      const needCc = sourceFilter === 'all' || sourceFilter === 'companycam';

      const novaPromise = needNova ? fetchNovacam(stats) : Promise.resolve([]);
      const ccPromise = needCc
        ? fetchCcPage(1, debouncedSearchRef.current, stats, false)
        : Promise.resolve([]);

      const [nova, tagsRes] = await Promise.all([novaPromise, tagsPromise, ccPromise]);

      if (needNova) setNovacamProjects(nova);
      else setNovacamProjects([]);

      if (!needCc) {
        setCcProjects([]);
        setCcHasMore(false);
      }

      if (!tagsRes.error) setAvailableTags(tagsRes.data || []);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Échec du chargement');
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: err.message || 'Impossible de charger les projets',
      });
    } finally {
      setLoading(false);
    }
  }, [user, sourceFilter, loadTrackerStats, fetchNovacam, fetchCcPage, toast]);

  // Initial + source filter changes
  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, sourceFilter]);

  // CompanyCam server-side search only (debounced). Initial load is fetchAll.
  const lastSearchRef = useRef(debouncedSearch);
  useEffect(() => {
    if (lastSearchRef.current === debouncedSearch) return;
    lastSearchRef.current = debouncedSearch;
    if (sourceFilter === 'novacam') return;
    let cancelled = false;
    (async () => {
      setCcLoading(true);
      try {
        await fetchCcPage(1, debouncedSearch, statsRef.current, false);
      } catch (err) {
        if (!cancelled) {
          toast({
            variant: 'destructive',
            title: 'CompanyCam',
            description: err.message,
          });
        }
      } finally {
        if (!cancelled) setCcLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, fetchCcPage, toast, sourceFilter]);

  const handleLoadMore = async () => {
    if (loadingMore || !ccHasMore) return;
    if (sourceFilter === 'novacam') return;
    setLoadingMore(true);
    try {
      await fetchCcPage(ccPage + 1, debouncedSearch, statsRef.current, true);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erreur', description: err.message });
    } finally {
      setLoadingMore(false);
    }
  };

  const handleTagToggle = (tagName) => {
    setSelectedTags((prev) =>
      prev.includes(tagName) ? prev.filter((t) => t !== tagName) : [...prev, tagName]
    );
  };

  const resetFilters = () => {
    setSourceFilter('all');
    setSelectedTags([]);
    setSearchQuery('');
    setDebouncedSearch('');
    localStorage.removeItem(STORAGE_KEY);
  };

  const unifiedList = useMemo(() => {
    // Shadow Novacam rows (HubSpot/link stubs with companycam_project_id) are metadata only —
    // keep showing the real CompanyCam project with photos instead.
    let nova = novacamProjects.filter((p) => !p.companycam_project_id);
    let cc = [...ccProjects];

    let list = [];
    if (sourceFilter === 'novacam') list = nova;
    else if (sourceFilter === 'companycam') list = cc;
    else list = [...nova, ...cc];

    const q = debouncedSearch.toLowerCase();
    if (q) {
      list = list.filter((p) => {
        const name = (p.name || '').toLowerCase();
        const addr =
          typeof p.address === 'string'
            ? p.address.toLowerCase()
            : [
                p.address?.street_address_1,
                p.address?.city,
                p.full_address,
              ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();
        const tags =
          p.source === 'companycam'
            ? (p.tags || [])
                .map((t) => (typeof t === 'string' ? t : t.display_value || t.name || ''))
                .join(' ')
                .toLowerCase()
            : (p.project_tags || [])
                .map((pt) => pt.tags?.name || '')
                .join(' ')
                .toLowerCase();
        return name.includes(q) || addr.includes(q) || tags.includes(q);
      });
    }

    if (selectedTags.length > 0) {
      list = list.filter((p) => {
        const names =
          p.source === 'companycam'
            ? (p.tags || []).map((t) =>
                typeof t === 'string' ? t : t.display_value || t.name || ''
              )
            : (p.project_tags || []).map((pt) => pt.tags?.name).filter(Boolean);
        return selectedTags.every((t) => names.includes(t));
      });
    }

    list.sort((a, b) => {
      const da = new Date(a.updated_at || a.created_at || 0).getTime();
      const db = new Date(b.updated_at || b.created_at || 0).getTime();
      return db - da;
    });

    return list;
  }, [
    novacamProjects,
    ccProjects,
    sourceFilter,
    debouncedSearch,
    selectedTags,
  ]);

  const handleProjectClick = (project) => {
    // CompanyCam rows always open the CC detail route — never route via supabase_id
    // (HubSpot link stubs upsert empty Novacam projects with 0 photos).
    if (project.source === 'companycam') {
      navigate(`/project-cc/${project.id}`);
      return;
    }
    navigate(`/project/${project.id}`);
  };

  const sourceTabs = [
    { value: 'all', label: 'Tous' },
    { value: 'novacam', label: 'Novacam' },
    { value: 'companycam', label: 'CompanyCam' },
  ];

  return (
    <DashboardLayout>
      <Helmet>
        <title>Dashboard - Novakleen</title>
        <meta
          name="description"
          content="Tableau de bord des projets Novacam et CompanyCam — photos, heures et produits."
        />
      </Helmet>

      <Tabs value={mainViewTab} onValueChange={setMainViewTab} className="space-y-5">
        <div className="flex flex-col space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white hidden sm:block">
                Projets
              </h1>
              <TabsList className="bg-gray-100 dark:bg-gray-800 p-1 border border-gray-200 dark:border-gray-700 rounded-xl h-11 shadow-sm">
                <TabsTrigger value="active" className="rounded-lg px-4">
                  Actifs
                </TabsTrigger>
                <TabsTrigger value="archived" className="rounded-lg px-4 gap-2">
                  <Archive className="h-3.5 w-3.5" /> Archivés
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="flex w-full sm:w-auto gap-3">
              {mainViewTab === 'active' && (
                <div className="relative flex-1 sm:w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    placeholder="Rechercher un projet…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 h-11 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-sm rounded-xl"
                  />
                </div>
              )}
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-11 w-11 rounded-xl shrink-0"
                onClick={fetchAll}
                title="Actualiser"
              >
                <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              </Button>
              <Button
                onClick={() => setShowCreateDialog(true)}
                className="h-11 bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20 rounded-xl px-4 shrink-0"
              >
                <Plus className="mr-2 h-5 w-5" />
                <span className="hidden sm:inline">Créer</span>
                <span className="sm:hidden">Nouveau</span>
              </Button>
            </div>
          </div>

          {mainViewTab === 'active' && (
            <div className="flex flex-col lg:flex-row gap-3 lg:items-center justify-between">
              <div className="inline-flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                {sourceTabs.map((tab) => (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => setSourceFilter(tab.value)}
                    className={cn(
                      'px-4 h-9 rounded-lg text-sm font-medium transition-all',
                      sourceFilter === tab.value
                        ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
                {(selectedTags.length > 0 || sourceFilter !== 'all' || searchQuery) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={resetFilters}
                    className="h-8 px-2 text-red-500 hover:text-red-600 hover:bg-red-50 text-xs shrink-0"
                  >
                    <FilterX className="mr-1 h-3 w-3" /> Reset
                  </Button>
                )}
                {availableTags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => handleTagToggle(tag.name)}
                    className={cn(
                      'cursor-pointer px-3 py-1.5 rounded-full text-xs font-medium border transition-all whitespace-nowrap',
                      selectedTags.includes(tag.name)
                        ? 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700'
                    )}
                  >
                    {tag.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <TabsContent value="active" className="mt-0 space-y-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
            {/* Header */}
            <div className="hidden lg:grid grid-cols-[minmax(0,1.6fr)_minmax(140px,0.7fr)_minmax(180px,0.9fr)_minmax(160px,0.8fr)] gap-6 px-4 py-3 border-b border-gray-100 dark:border-gray-800 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <div className="flex items-center gap-2">
                <LayoutList className="h-3.5 w-3.5" /> Nom du projet
              </div>
              <div>Dernière MAJ</div>
              <div>Stats</div>
              <div className="text-right">Photos récentes</div>
            </div>

            {loading || ccLoading ? (
              <div className="flex flex-col items-center justify-center py-24 gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                <p className="text-sm text-gray-500">Chargement des projets…</p>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
                <FilterX className="h-8 w-8 text-red-500 mb-3" />
                <h3 className="text-lg font-semibold text-red-900 dark:text-red-200 mb-2">
                  Échec du chargement
                </h3>
                <p className="text-red-600 dark:text-red-300 max-w-sm mb-4">{error}</p>
                <Button onClick={fetchAll} variant="outline">
                  <RefreshCw className="mr-2 h-4 w-4" /> Réessayer
                </Button>
              </div>
            ) : unifiedList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
                <div className="w-14 h-14 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
                  <FilterX className="h-6 w-6 text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                  Aucun projet trouvé
                </h3>
                <p className="text-sm text-gray-500 max-w-sm mb-4">
                  {searchQuery || selectedTags.length
                    ? 'Essayez d’ajuster les filtres ou la recherche.'
                    : 'Créez un projet Novacam ou synchronisez CompanyCam.'}
                </p>
                {searchQuery || selectedTags.length || sourceFilter !== 'all' ? (
                  <Button variant="outline" onClick={resetFilters}>
                    Effacer les filtres
                  </Button>
                ) : (
                  <Button onClick={() => setShowCreateDialog(true)}>Créer un projet</Button>
                )}
              </div>
            ) : (
              <div>
                {unifiedList.map((project) => (
                  <ProjectListRow
                    key={project.list_key}
                    project={project}
                    onClick={() => handleProjectClick(project)}
                  />
                ))}
              </div>
            )}
          </div>

          {!loading && sourceFilter !== 'novacam' && ccHasMore && (
            <div className="flex justify-center pt-2 pb-6">
              <Button
                variant="outline"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="rounded-xl h-11 px-6"
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Chargement…
                  </>
                ) : (
                  'Charger plus de projets CompanyCam'
                )}
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="archived" className="mt-0">
          <ArchivedProjectsSection />
        </TabsContent>
      </Tabs>

      <CreateProjectDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSuccess={fetchAll}
      />

      {editingProject && (
        <EditProjectDialog
          project={editingProject}
          open={!!editingProject}
          onOpenChange={(open) => !open && setEditingProject(null)}
          onSuccess={fetchAll}
        />
      )}
    </DashboardLayout>
  );
};

export default DashboardPage;
