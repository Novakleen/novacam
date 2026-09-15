import React from 'react';
import {
  Image as ImageIcon,
  FileText,
  Clock,
  Droplets,
  Users,
  Camera,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow, format, isValid } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/utils';

const formatRelative = (dateString) => {
  if (!dateString) return '—';
  const d = new Date(typeof dateString === 'number' ? dateString * 1000 : dateString);
  if (!isValid(d)) return '—';
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 1000 * 60 * 60 * 24 * 7) {
    return formatDistanceToNow(d, { addSuffix: true, locale: fr });
  }
  return format(d, 'd MMM yyyy, HH:mm', { locale: fr });
};

const formatAddress = (project) => {
  if (project.source === 'companycam') {
    const a = project.address;
    if (!a) return project.formatted_address || '—';
    if (typeof a === 'string') return a;
    const parts = [
      a.street_address_1 || a.street_address_2,
      [a.city, a.state].filter(Boolean).join(', '),
      a.postal_code,
      a.country,
    ].filter(Boolean);
    return parts.join(' · ') || '—';
  }
  return project.full_address || project.address || '—';
};

const getDisplayName = (project) => {
  const raw = project.name || 'Sans nom';
  return raw.replace(/\s*\[.*?\]$/, '').trim();
};

const TAG_COLORS = [
  'bg-yellow-100 text-yellow-800 border-yellow-200',
  'bg-amber-100 text-amber-800 border-amber-200',
  'bg-orange-100 text-orange-800 border-orange-200',
  'bg-emerald-100 text-emerald-800 border-emerald-200',
  'bg-green-100 text-green-800 border-green-200',
  'bg-sky-100 text-sky-800 border-sky-200',
  'bg-blue-100 text-blue-800 border-blue-200',
  'bg-violet-100 text-violet-800 border-violet-200',
  'bg-slate-100 text-slate-700 border-slate-200',
  'bg-rose-100 text-rose-800 border-rose-200',
];

const tagColor = (name = '') => {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h + name.charCodeAt(i) * (i + 1)) % TAG_COLORS.length;
  return TAG_COLORS[h];
};

const ProjectListRow = ({ project, onClick }) => {
  const isCC = project.source === 'companycam';
  const displayName = getDisplayName(project);
  const address = formatAddress(project);
  const updatedAt = project.updated_at || project.created_at;
  const creator = project.created_by_profile;
  const initials =
    creator?.initials ||
    (creator?.full_name
      ? creator.full_name
          .split(' ')
          .map((w) => w[0])
          .join('')
          .slice(0, 2)
          .toUpperCase()
      : isCC
        ? 'CC'
        : 'NK');

  const tags = (() => {
    if (isCC) {
      const raw = project.tags || project.labels || project.project_tags || [];
      return raw
        .map((t) =>
          typeof t === 'string'
            ? t
            : t.display_value || t.name || t.value || t.tags?.name
        )
        .filter(Boolean);
    }
    return (project.project_tags || [])
      .map((pt) => pt.tags?.name || pt.name)
      .filter(Boolean);
  })();

  const recentPhotos = project.recent_photos || [];
  const thumb =
    project.thumbnail_url ||
    recentPhotos[0]?.url ||
    recentPhotos[0]?.file_url ||
    null;

  const photoCount = project.stats?.photos ?? recentPhotos.length ?? 0;
  const hours = project.stats?.hours ?? 0;
  const productQty = project.stats?.product_qty ?? 0;
  const surface = project.stats?.surface_m2 ?? 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left group border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50/80 dark:hover:bg-gray-800/40 transition-colors"
    >
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.6fr)_minmax(140px,0.7fr)_minmax(180px,0.9fr)_minmax(160px,0.8fr)] gap-4 lg:gap-6 px-3 sm:px-4 py-4 items-start lg:items-center">
        {/* Project name */}
        <div className="flex gap-3 min-w-0">
          <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 shrink-0 ring-1 ring-black/5">
            {thumb ? (
              <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-gray-400">
                <ImageIcon className="h-6 w-6 opacity-50" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-0.5">
              <h3 className="font-semibold text-gray-900 dark:text-white text-[15px] leading-snug truncate group-hover:text-blue-600 transition-colors">
                {displayName}
              </h3>
              <Badge
                className={cn(
                  'text-[10px] font-semibold uppercase tracking-wide border px-1.5 py-0 h-5',
                  isCC
                    ? 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800'
                    : 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800'
                )}
              >
                {isCC ? 'CompanyCam' : 'Novacam'}
              </Badge>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 leading-snug mb-2">
              {address}
            </p>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tags.slice(0, 8).map((tag) => (
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
                {tags.length > 8 && (
                  <span className="text-[11px] text-gray-400 font-medium">+{tags.length - 8}</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Last updated */}
        <div className="flex lg:flex-col gap-2 lg:gap-1.5 items-center lg:items-start pl-[4.25rem] lg:pl-0">
          <span className="text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
            {formatRelative(updatedAt)}
          </span>
          <div className="flex items-center gap-1.5 text-gray-400">
            <Users className="h-3.5 w-3.5" />
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-[10px] font-semibold text-gray-600 dark:text-gray-300">
              {initials}
            </span>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm text-gray-600 dark:text-gray-300 pl-[4.25rem] lg:pl-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <Camera className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <span className="truncate">
              <span className="font-medium text-gray-800 dark:text-gray-100">{photoCount}</span> Photos
            </span>
          </div>
          <div className="flex items-center gap-1.5 min-w-0">
            <Clock className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <span className="truncate">
              <span className="font-medium text-gray-800 dark:text-gray-100">
                {Number(hours || 0).toFixed(1)}
              </span>{' '}
              h
            </span>
          </div>
          <div className="flex items-center gap-1.5 min-w-0">
            <Droplets className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <span className="truncate">
              <span className="font-medium text-gray-800 dark:text-gray-100">
                {Number(productQty || 0).toFixed(1)}
              </span>{' '}
              qté
            </span>
          </div>
          <div className="flex items-center gap-1.5 min-w-0">
            <FileText className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <span className="truncate">
              <span className="font-medium text-gray-800 dark:text-gray-100">
                {Number(surface || 0).toFixed(0)}
              </span>{' '}
              m²
            </span>
          </div>
        </div>

        {/* Recent photos */}
        <div className="flex gap-1.5 justify-start lg:justify-end pl-[4.25rem] lg:pl-0 overflow-hidden">
          {recentPhotos.length > 0 ? (
            recentPhotos.slice(0, 4).map((photo, idx) => {
              const url = photo.url || photo.file_url || photo.thumbnail_url;
              return (
                <div
                  key={photo.id || idx}
                  className="h-12 w-12 sm:h-14 sm:w-14 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 ring-1 ring-black/5 shrink-0"
                >
                  {url ? (
                    <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : null}
                </div>
              );
            })
          ) : (
            <div className="h-12 w-28 rounded-lg border border-dashed border-gray-200 dark:border-gray-700 flex items-center justify-center text-[11px] text-gray-400">
              Aucune photo
            </div>
          )}
        </div>
      </div>
    </button>
  );
};

export default ProjectListRow;
