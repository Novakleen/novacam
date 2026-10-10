import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Layers, CheckSquare, Search, Share2, X } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import DashboardLayout from '@/components/layout/DashboardLayout';
import MediaGrid from '@/components/media/MediaGrid';
import ShareGalleryDialog from '@/components/media/ShareGalleryDialog';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

const PAGE_SIZE = 24;

const MEDIA_COLUMNS = `
  id, project_id, uploaded_by, file_url, web_url, thumbnail_url, file_type,
  kind, annotations, annotated_url,
  description, duration, size, created_at, captured_at, latitude, longitude, width, height,
  show_in_portfolio,
  uploaded_by_profile:profiles!uploaded_by(full_name, initials, id),
  project:projects(id, name),
  media_tags(tag_id, tags(name))
`;

const PhotosPage = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [media, setMedia] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [showShareDialog, setShowShareDialog] = useState(false);

  const [allProjects, setAllProjects] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [allTags, setAllTags] = useState([]);

  const [filterProject, setFilterProject] = useState([]);
  const [filterUser, setFilterUser] = useState([]);
  const [filterTags, setFilterTags] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  const offsetRef = useRef(0);
  const requestRef = useRef(0);
  const sentinelRef = useRef(null);
  const loadMoreRef = useRef(() => {});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [projectsRes, tagsRes, usersRes] = await Promise.all([
        supabase.from('projects').select('id, name'),
        supabase.from('tags').select('*'),
        supabase.from('profiles').select('id, full_name, initials').order('full_name'),
      ]);
      if (cancelled) return;
      setAllProjects(projectsRes.data || []);
      setAllTags(tagsRes.data || []);
      setAllUsers(usersRes.data || []);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const loadPage = useCallback(async (reset) => {
    const requestId = ++requestRef.current;
    if (reset) setLoading(true);
    else setLoadingMore(true);

    try {
      const queryText = searchQuery.trim().toLowerCase();
      let projectIds = null;
      if (queryText) {
        projectIds = allProjects
          .filter((project) => project.name?.toLowerCase().includes(queryText))
          .map((project) => project.id);
      }
      if (filterProject.length > 0) {
        projectIds = projectIds
          ? projectIds.filter((id) => filterProject.includes(id))
          : [...filterProject];
      }

      if (projectIds && projectIds.length === 0) {
        if (requestId !== requestRef.current) return;
        offsetRef.current = 0;
        setMedia([]);
        setHasMore(false);
        return;
      }

      const offset = reset ? 0 : offsetRef.current;
      let query = supabase
        .from('media')
        .select(filterTags.length > 0 ? MEDIA_COLUMNS.replace('media_tags(', 'media_tags!inner(') : MEDIA_COLUMNS)
        .order('captured_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });

      if (projectIds) query = query.in('project_id', projectIds);
      if (filterUser.length > 0) query = query.in('uploaded_by', filterUser);
      if (filterTags.length > 0) query = query.in('media_tags.tag_id', filterTags);
      query = query.range(offset, offset + PAGE_SIZE - 1);

      const { data, error } = await query;
      if (error) throw error;
      if (requestId !== requestRef.current) return;

      const rows = data || [];
      offsetRef.current = offset + rows.length;
      setHasMore(rows.length === PAGE_SIZE);
      setMedia((prev) => {
        if (reset) return rows;
        const seen = new Set(prev.map((item) => item.id));
        return [...prev, ...rows.filter((item) => !seen.has(item.id))];
      });
    } catch (error) {
      console.error('Error fetching photos:', error);
      if (requestId !== requestRef.current) return;
      toast({
        variant: 'destructive',
        title: t('common.error'),
        description: t('photosPage.loadError'),
      });
    } finally {
      if (requestId === requestRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [allProjects, filterProject, filterTags, filterUser, searchQuery, t, toast]);

  useEffect(() => {
    if (!user) return;
    offsetRef.current = 0;
    loadPage(true);
  }, [user, loadPage]);

  loadMoreRef.current = () => {
    if (!loading && !loadingMore && hasMore) loadPage(false);
  };

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMoreRef.current();
      },
      { rootMargin: '640px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loading, media.length, hasMore]);

  const handleToggleSelect = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const toggleSelectionMode = () => {
    if (isSelectionMode) {
      setIsSelectionMode(false);
      setSelectedIds([]);
    } else {
      setIsSelectionMode(true);
    }
  };

  const selectAll = () => {
    if (selectedIds.length === media.length) setSelectedIds([]);
    else setSelectedIds(media.map((item) => item.id));
  };

  return (
    <DashboardLayout>
      <Helmet>
        <title>{t('photosPage.pageTitle')}</title>
        <meta name="description" content={t('photosPage.title')} />
      </Helmet>

      <div className="space-y-6 relative pb-20">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h1 className="text-3xl font-bold text-[#1a2634] dark:text-white">{t('photosPage.title')}</h1>
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder={t('photosPage.searchProjects')}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="pl-9"
              />
            </div>
            <Button
              variant={isSelectionMode ? 'secondary' : 'outline'}
              onClick={toggleSelectionMode}
              className="shrink-0"
            >
              {isSelectionMode ? <X className="h-4 w-4 mr-2" /> : <CheckSquare className="h-4 w-4 mr-2" />}
              {isSelectionMode ? t('photosPage.cancel') : t('photosPage.select')}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-center bg-white dark:bg-gray-800 p-2 rounded-lg border border-gray-200 dark:border-gray-700">
          <span className="text-sm font-medium text-gray-500 ml-2 mr-2">{t('photosPage.filters')}:</span>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className={`h-8 border-dashed ${filterProject.length > 0 ? 'bg-blue-50 border-blue-200 text-blue-700' : ''}`}>
                {t('photosPage.projects')} {filterProject.length > 0 && `(${filterProject.length})`} <ChevronDown className="ml-2 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 max-h-64 overflow-y-auto">
              <DropdownMenuLabel>{t('photosPage.filterProject')}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {allProjects.map((project) => (
                <DropdownMenuCheckboxItem
                  key={project.id}
                  checked={filterProject.includes(project.id)}
                  onCheckedChange={(checked) =>
                    setFilterProject((prev) => (checked ? [...prev, project.id] : prev.filter((id) => id !== project.id)))
                  }
                >
                  {project.name}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className={`h-8 border-dashed ${filterUser.length > 0 ? 'bg-blue-50 border-blue-200 text-blue-700' : ''}`}>
                {t('photosPage.users')} {filterUser.length > 0 && `(${filterUser.length})`} <ChevronDown className="ml-2 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56">
              <DropdownMenuLabel>{t('photosPage.filterUser')}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {allUsers.map((profile) => (
                <DropdownMenuCheckboxItem
                  key={profile.id}
                  checked={filterUser.includes(profile.id)}
                  onCheckedChange={(checked) =>
                    setFilterUser((prev) => (checked ? [...prev, profile.id] : prev.filter((id) => id !== profile.id)))
                  }
                >
                  {profile.full_name}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className={`h-8 border-dashed ${filterTags.length > 0 ? 'bg-blue-50 border-blue-200 text-blue-700' : ''}`}>
                {t('photosPage.tags')} {filterTags.length > 0 && `(${filterTags.length})`} <ChevronDown className="ml-2 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56">
              <DropdownMenuLabel>{t('photosPage.filterTag')}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {allTags.map((tag) => (
                <DropdownMenuCheckboxItem
                  key={tag.id}
                  checked={filterTags.includes(tag.id)}
                  onCheckedChange={(checked) =>
                    setFilterTags((prev) => (checked ? [...prev, tag.id] : prev.filter((id) => id !== tag.id)))
                  }
                >
                  {tag.name}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {(filterProject.length > 0 || filterUser.length > 0 || filterTags.length > 0) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-red-500 hover:text-red-600 hover:bg-red-50"
              onClick={() => {
                setFilterProject([]);
                setFilterUser([]);
                setFilterTags([]);
              }}
            >
              {t('photosPage.reset')}
            </Button>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1">
            {Array.from({ length: 9 }, (_, index) => (
              <div key={index} className="aspect-square bg-gray-200 dark:bg-gray-700 animate-pulse" />
            ))}
          </div>
        ) : media.length === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 border-dashed">
            <div className="mx-auto w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center mb-4">
              <Layers className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">{t('photosPage.empty')}</h3>
            <p className="text-gray-500 dark:text-gray-400 mt-1">{t('photosPage.emptyHint')}</p>
          </div>
        ) : (
          <MediaGrid
            media={media}
            onRefresh={() => loadPage(true)}
            selectable={isSelectionMode}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
          />
        )}

        <div ref={sentinelRef} className="h-8 flex items-center justify-center text-sm text-gray-500">
          {loadingMore && t('media.loadingMore')}
          {!loading && !loadingMore && media.length > 0 && hasMore && (
            <Button variant="outline" size="sm" onClick={() => loadPage(false)}>
              {t('media.loadMore')}
            </Button>
          )}
          {!loading && !hasMore && media.length > 0 && <span>{t('photosPage.end')}</span>}
        </div>

        <AnimatePresence>
          {isSelectionMode && (
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-[#1a2634] text-white px-4 sm:px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 sm:gap-6 max-w-[calc(100vw-1.5rem)] overflow-x-auto"
            >
              <div className="flex items-center gap-4 border-r border-gray-600 pr-4">
                <Button variant="ghost" className="text-white hover:bg-white/10" onClick={() => setIsSelectionMode(false)}>
                  <X className="h-5 w-5" />
                </Button>
                <span className="font-semibold">{t('photosPage.selected', { count: selectedIds.length })}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" className="text-white hover:bg-white/10" onClick={selectAll}>
                  {t('photosPage.selectAll')}
                </Button>
                <Button
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  disabled={selectedIds.length === 0}
                  onClick={() => setShowShareDialog(true)}
                >
                  <Share2 className="h-4 w-4 mr-2" />
                  {t('photosPage.share')}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <ShareGalleryDialog
        open={showShareDialog}
        onOpenChange={setShowShareDialog}
        selectedMediaIds={selectedIds}
        onResetSelection={() => {
          setSelectedIds([]);
          setIsSelectionMode(false);
        }}
        defaultTitle={t('photosPage.title')}
      />
    </DashboardLayout>
  );
};

export default PhotosPage;
