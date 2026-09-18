import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import {
  ArrowLeft,
  Camera,
  RefreshCw,
  ExternalLink,
  MapPin,
  Calendar,
  Loader2,
  AlertCircle,
  Clock,
  Droplets,
  Wallet,
  Image as ImageIcon,
  ClipboardList,
  MoreHorizontal,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import MediaGrid from '@/components/media/MediaGrid';
import ProjectTimeSection from '@/components/time/ProjectTimeSection';
import ProjectSpraySection from '@/components/spray/ProjectSpraySection';
import ProjectExpenseSection from '@/components/expenses/ProjectExpenseSection';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import * as ccApi from '@/lib/companycamService';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const TAG_COLORS = [
  'bg-yellow-100 text-yellow-800 border-yellow-200',
  'bg-amber-100 text-amber-800 border-amber-200',
  'bg-orange-100 text-orange-800 border-orange-200',
  'bg-emerald-100 text-emerald-800 border-emerald-200',
  'bg-sky-100 text-sky-800 border-sky-200',
  'bg-blue-100 text-blue-800 border-blue-200',
  'bg-violet-100 text-violet-800 border-violet-200',
  'bg-rose-100 text-rose-800 border-rose-200',
  'bg-slate-100 text-slate-700 border-slate-200',
];

const tagColor = (name = '') => {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h + name.charCodeAt(i) * (i + 1)) % TAG_COLORS.length;
  return TAG_COLORS[h];
};

const normalizeList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.projects)) return payload.projects;
  if (Array.isArray(payload?.photos)) return payload.photos;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

const extractPhotoUrl = (photo) => {
  if (!photo) return null;
  if (typeof photo.uri === 'string' && photo.uri) return photo.uri;
  if (Array.isArray(photo.uris) && photo.uris.length) {
    const preferred =
      photo.uris.find((u) => u.type === 'thumbnail' || u.type === 'web') || photo.uris[0];
    return preferred?.url || preferred?.uri || null;
  }
  return photo.url || photo.thumbnail_url || photo.file_url || null;
};

const toIso = (value) => {
  if (!value) return null;
  if (typeof value === 'number') return new Date(value * 1000).toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

const formatAddress = (project) => {
  const a = project?.address;
  if (!a) return project?.formatted_address || '—';
  if (typeof a === 'string') return a;
  const parts = [
    a.street_address_1 || a.street_address_2,
    [a.city, a.state].filter(Boolean).join(', '),
    a.postal_code,
    a.country,
  ].filter(Boolean);
  return parts.join(' · ') || '—';
};

const SidebarCard = ({ title, action, children, className }) => (
  <div
    className={cn(
      'bg-white dark:bg-gray-900 rounded-xl border border-gray-200/80 dark:border-gray-800 p-4',
      className
    )}
  >
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
      {action}
    </div>
    {children}
  </div>
);

const CompanyCamProjectDetailPage = () => {
  const { ccId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [project, setProject] = useState(null);
  const [media, setMedia] = useState([]);
  const [loading, setLoading] = useState(true);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('photos');

  const fetchProject = useCallback(async () => {
    if (!ccId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await ccApi.getProject(ccId);
      if (!res.success) throw new Error(res.error || 'Projet CompanyCam introuvable.');

      let projectData = res.data || {};
      try {
        const labelsRes = await ccApi.listProjectLabels(ccId, { per_page: 50, page: 1 });
        if (labelsRes.success) {
          const names = ccApi.normalizeCcTagNames(labelsRes.data);
          projectData = { ...projectData, tags: names };
        } else if (!Array.isArray(projectData.tags)) {
          projectData = { ...projectData, tags: [] };
        }
      } catch {
        if (!Array.isArray(projectData.tags)) {
          projectData = { ...projectData, tags: [] };
        }
      }

      setProject(projectData);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Impossible de charger le projet CompanyCam.');
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: err.message || 'Impossible de charger le projet CompanyCam.',
      });
    } finally {
      setLoading(false);
    }
  }, [ccId, toast]);

  const fetchPhotos = useCallback(async () => {
    if (!ccId) return;
    setPhotosLoading(true);
    try {
      const res = await ccApi.listProjectPhotos(ccId, { per_page: 100, page: 1 });
      if (!res.success) throw new Error(res.error || 'Échec du chargement des photos.');
      const photos = normalizeList(res.data);
      const mapped = photos
        .map((ph) => {
          const url = extractPhotoUrl(ph);
          if (!url) return null;
          const tags = Array.isArray(ph.tags)
            ? ph.tags
                .map((t) => (typeof t === 'string' ? t : t.display_value || t.name))
                .filter(Boolean)
            : [];
          return {
            id: ph.id,
            file_url: url,
            thumbnail_url: url,
            file_type: 'image',
            created_at: toIso(ph.created_at) || toIso(ph.taken_at) || new Date().toISOString(),
            description: ph.description || ph.caption || null,
            media_tags: tags.map((name) => ({ tag_id: name, tags: { name } })),
            uploaded_by_profile: ph.user
              ? { initials: (ph.user.name || ph.user.email || 'CC').slice(0, 2).toUpperCase() }
              : { initials: 'CC' },
          };
        })
        .filter(Boolean);
      setMedia(mapped);
    } catch (err) {
      console.error(err);
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: err.message || 'Échec du chargement des photos.',
      });
    } finally {
      setPhotosLoading(false);
    }
  }, [ccId, toast]);

  useEffect(() => {
    fetchProject();
    fetchPhotos();
  }, [fetchProject, fetchPhotos]);

  const projectName = (project?.name || `CompanyCam #${ccId}`).replace(/\s*\[.*?\]$/, '').trim();
  const address = formatAddress(project);
  const updatedAt =
    toIso(project?.updated_at) ||
    toIso(project?.last_activity_at) ||
    toIso(project?.created_at) ||
    null;
  const createdAt = toIso(project?.created_at);
  const tags = Array.isArray(project?.tags)
    ? project.tags
        .map((t) => (typeof t === 'string' ? t : t.display_value || t.name || t.value))
        .filter(Boolean)
    : [];

  const openInCompanyCam = () => {
    if (project?.uri) {
      window.open(project.uri, '_blank', 'noopener,noreferrer');
    }
  };

  const openInMaps = () => {
    if (!address || address === '—') return;
    window.open(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  const thumb = media[0]?.thumbnail_url || media[0]?.file_url || null;

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
        </div>
      </DashboardLayout>
    );
  }

  if (error || !project) {
    return (
      <DashboardLayout>
        <Helmet>
          <title>Projet CompanyCam - Novakleen</title>
        </Helmet>
        <div className="min-h-[50vh] flex flex-col items-center justify-center text-center p-6 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-200 dark:border-gray-700 mt-8">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
            <AlertCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Projet CompanyCam indisponible
          </h1>
          <p className="text-gray-600 dark:text-gray-400 max-w-md mb-8">
            {error || 'Ce projet CompanyCam n’a pas pu être chargé.'}
          </p>
          <div className="flex gap-2">
            <Button onClick={fetchProject} variant="outline" className="gap-2">
              <RefreshCw className="h-4 w-4" /> Réessayer
            </Button>
            <Button onClick={() => navigate('/dashboard')} className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Dashboard
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Helmet>
        <title>{projectName} - Novakleen</title>
        <meta name="description" content={`Détails du projet CompanyCam ${projectName}`} />
      </Helmet>

      <div className="max-w-[1400px] mx-auto pb-28 md:pb-10">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-3 mb-6">
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Projets
          </button>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchPhotos}
              className="hidden sm:inline-flex h-9 rounded-full text-gray-600 gap-1.5"
            >
              <RefreshCw className={cn('h-4 w-4', photosLoading && 'animate-spin')} />
              Actualiser
            </Button>
            {project.uri && (
              <Button
                variant="ghost"
                size="sm"
                onClick={openInCompanyCam}
                className="hidden md:inline-flex h-9 rounded-full text-gray-600 gap-1.5"
              >
                <ExternalLink className="h-4 w-4" />
                CompanyCam
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={openInMaps}>
                  <MapPin className="mr-2 h-4 w-4" /> Voir sur la carte
                </DropdownMenuItem>
                <DropdownMenuItem onClick={fetchPhotos}>
                  <RefreshCw className="mr-2 h-4 w-4" /> Actualiser photos
                </DropdownMenuItem>
                {project.uri && (
                  <DropdownMenuItem onClick={openInCompanyCam}>
                    <ExternalLink className="mr-2 h-4 w-4" /> Ouvrir CompanyCam
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Project header */}
        <div className="flex gap-4 sm:gap-5 mb-6">
          <div className="h-20 w-20 sm:h-28 sm:w-28 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 shrink-0 ring-1 ring-black/5">
            {thumb ? (
              <img src={thumb} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-gray-300">
                <ImageIcon className="h-8 w-8" />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 pt-0.5">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white tracking-tight leading-tight">
              {projectName}
            </h1>
            <button
              type="button"
              onClick={openInMaps}
              className="mt-1 text-sm text-blue-600 hover:underline text-left line-clamp-2"
            >
              {address}
            </button>

            <div className="flex flex-wrap items-center gap-2 mt-3">
              <Badge className="bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800 text-[11px] font-semibold uppercase tracking-wide border px-2 py-0.5">
                CompanyCam
              </Badge>
              {tags.map((tag) => (
                <span
                  key={tag}
                  className={cn(
                    'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium',
                    tagColor(tag)
                  )}
                >
                  {tag}
                </span>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-400">
              {createdAt && (
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Créé {new Date(createdAt).toLocaleDateString('fr-BE')}
                </span>
              )}
              {updatedAt && (
                <span>
                  MAJ{' '}
                  {new Date(updatedAt).toLocaleDateString('fr-BE', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-col xl:flex-row gap-6 xl:gap-8 items-start">
          <div className="flex-1 min-w-0 w-full">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <div className="border-b border-gray-200 dark:border-gray-800 mb-5">
                <TabsList className="bg-transparent h-auto p-0 gap-0 rounded-none w-full justify-start overflow-x-auto">
                  <TabsTrigger
                    value="photos"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-gray-900 dark:data-[state=active]:border-white data-[state=active]:bg-transparent data-[state=active]:shadow-none bg-transparent px-3 sm:px-4 py-2.5 text-sm font-medium text-gray-500 data-[state=active]:text-gray-900 dark:data-[state=active]:text-white gap-1.5"
                  >
                    Photos
                    <span className="text-gray-400 font-normal">({media.length})</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="suivi"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-gray-900 dark:data-[state=active]:border-white data-[state=active]:bg-transparent data-[state=active]:shadow-none bg-transparent px-3 sm:px-4 py-2.5 text-sm font-medium text-gray-500 data-[state=active]:text-gray-900 dark:data-[state=active]:text-white gap-1.5"
                  >
                    <ClipboardList className="h-3.5 w-3.5" />
                    Suivi
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="photos" className="mt-0 space-y-5 focus-visible:outline-none">
                <div className="flex flex-wrap items-center gap-2 sm:hidden">
                  <Button variant="outline" size="sm" onClick={fetchPhotos} className="rounded-lg h-9">
                    <RefreshCw className={cn('h-4 w-4 mr-1.5', photosLoading && 'animate-spin')} />
                    Actualiser
                  </Button>
                </div>

                {photosLoading && media.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-24 gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                    <p className="text-sm text-gray-500">Chargement des photos…</p>
                  </div>
                ) : (
                  <MediaGrid
                    media={media}
                    onRefresh={fetchPhotos}
                    projectId={null}
                    readOnly
                    isLoading={photosLoading && media.length === 0}
                  />
                )}
              </TabsContent>

              <TabsContent value="suivi" className="mt-0 space-y-6 focus-visible:outline-none">
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200/80 dark:border-gray-800 p-4 sm:p-5">
                  <ProjectTimeSection
                    projectId={null}
                    projectName={projectName}
                    companycamProjectId={String(ccId)}
                  />
                </div>
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200/80 dark:border-gray-800 p-4 sm:p-5">
                  <ProjectSpraySection
                    projectId={null}
                    projectName={projectName}
                    companycamProjectId={String(ccId)}
                  />
                </div>
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200/80 dark:border-gray-800 p-4 sm:p-5">
                  <ProjectExpenseSection
                    projectId={null}
                    projectName={projectName}
                    companycamProjectId={String(ccId)}
                  />
                </div>
              </TabsContent>
            </Tabs>
          </div>

          <aside className="w-full xl:w-[300px] shrink-0 space-y-3 xl:sticky xl:top-20">
            <SidebarCard title="Source">
              <div className="flex items-center gap-2.5">
                <Badge className="bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800">
                  CompanyCam
                </Badge>
                <span className="text-xs font-mono text-gray-400">#{ccId}</span>
              </div>
              {project.uri && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-3 h-8 rounded-lg text-xs"
                  onClick={openInCompanyCam}
                >
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  Ouvrir dans CompanyCam
                </Button>
              )}
            </SidebarCard>

            <SidebarCard title="Adresse">
              <button
                type="button"
                onClick={openInMaps}
                className="text-sm text-left text-gray-600 dark:text-gray-300 hover:text-blue-600 leading-relaxed"
              >
                <span className="inline-flex items-start gap-2">
                  <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0 text-gray-400" />
                  {address}
                </span>
              </button>
            </SidebarCard>

            {project.description ? (
              <SidebarCard title="Description">
                <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                  {project.description}
                </p>
              </SidebarCard>
            ) : null}

            <SidebarCard title="Suivi">
              <button
                type="button"
                onClick={() => setActiveTab('suivi')}
                className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors group"
              >
                <span className="h-8 w-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center text-emerald-600">
                  <Clock className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white group-hover:text-blue-600">
                    Heures prestées
                  </p>
                  <p className="text-xs text-gray-400">Time tracker</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('suivi')}
                className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors group"
              >
                <span className="h-8 w-8 rounded-lg bg-sky-50 dark:bg-sky-950/40 flex items-center justify-center text-sky-600">
                  <Droplets className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white group-hover:text-blue-600">
                    Pulvérisations
                  </p>
                  <p className="text-xs text-gray-400">Spray tracker</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('suivi')}
                className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors group"
              >
                <span className="h-8 w-8 rounded-lg bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center text-amber-600">
                  <Wallet className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white group-hover:text-blue-600">
                    Autres dépenses
                  </p>
                  <p className="text-xs text-gray-400">Expense tracker</p>
                </div>
              </button>
            </SidebarCard>

            <SidebarCard title="Photos">
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                <Camera className="h-4 w-4 text-gray-400" />
                <span>
                  <span className="font-semibold text-gray-900 dark:text-white">{media.length}</span>{' '}
                  photo{media.length !== 1 ? 's' : ''}
                </span>
              </div>
            </SidebarCard>
          </aside>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CompanyCamProjectDetailPage;
