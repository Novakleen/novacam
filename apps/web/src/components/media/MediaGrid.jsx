import React, { useState } from 'react';
import { Play, Tag, Trash2, Check, Video } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import MediaViewer from '@/components/media/MediaViewer';
import TagManager from '@/components/media/TagManager';
import { deleteProjectMedia } from '@/lib/mediaStorage';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { gridImageProps } from '@/lib/imageSizes';
import { formatCaptureClock, formatCaptureDay, groupMediaByCaptureDay } from '@/lib/mediaDates';
import { useTranslation } from 'react-i18next';

const formatDuration = (seconds) => {
  if (!seconds) return '';
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

const MediaCardSkeleton = () => (
  <div className="relative aspect-square bg-gray-200 dark:bg-gray-800 animate-pulse" />
);

const MediaGrid = ({
  media,
  onRefresh,
  projectId,
  selectable = false,
  selectedIds = [],
  onToggleSelect,
  readOnly = false,
  isLoading = false,
}) => {
  const { toast } = useToast();
  const { t, i18n } = useTranslation();
  const language = (i18n.resolvedLanguage || i18n.language || 'fr').slice(0, 2);
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [showViewer, setShowViewer] = useState(false);
  const [showTagManager, setShowTagManager] = useState(false);
  const [taggedMedia, setTaggedMedia] = useState(null);

  const groupedMedia = groupMediaByCaptureDay(media);

  const handleMediaClick = (item) => {
    if (selectable && onToggleSelect) {
      onToggleSelect(item.id);
      return;
    }
    setSelectedMedia(item);
    setShowViewer(true);
  };

  const handleTagClick = (event, item) => {
    event.stopPropagation();
    setTaggedMedia(item);
    setShowTagManager(true);
  };

  const handleDelete = async (event, item) => {
    event?.stopPropagation();
    if (readOnly) return;
    if (!window.confirm(t('media.deleteConfirm'))) return false;

    try {
      await deleteProjectMedia(item);
      toast({ title: t('common.success'), description: t('media.deleteSuccess') });
      if (onRefresh) onRefresh();
      return true;
    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: t('common.error'), description: t('media.deleteError') });
      return false;
    }
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-1">
        {Array.from({ length: 9 }, (_, index) => (
          <MediaCardSkeleton key={index} />
        ))}
      </div>
    );
  }

  if (media.length === 0) {
    return (
      <div className="text-center py-24 bg-white dark:bg-gray-800/50 rounded-3xl border border-dashed border-gray-200 dark:border-gray-700">
        <p className="text-gray-500 dark:text-gray-400 font-medium">{t('media.emptyTitle')}</p>
        {!readOnly && <p className="text-sm text-gray-400 mt-1">{t('media.emptyHint')}</p>}
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {groupedMedia.map(([date, items]) => (
          <div key={date}>
            <h3
              data-testid="day-header"
              className="mb-2 rounded-md bg-white px-2 py-2 text-sm font-bold text-gray-800 dark:bg-gray-900 dark:text-gray-100"
            >
              {date === 'unknown' ? t('media.unknownDay') : formatCaptureDay(date, language)}
            </h3>

            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-1">
              {items.map((item) => {
                const isSelected = selectedIds.includes(item.id);
                const isVideo = item.file_type === 'video';
                const sources = gridImageProps(item);
                const duration = item.duration;

                return (
                  <div
                    key={item.id}
                    data-testid="media-tile"
                    className={cn(
                      'relative aspect-square overflow-hidden cursor-pointer group bg-gray-200 dark:bg-gray-800',
                      isSelected && 'ring-2 ring-blue-500 ring-inset',
                      selectable && !isSelected && 'hover:opacity-90'
                    )}
                    onClick={() => handleMediaClick(item)}
                  >
                    <img
                      src={sources.src}
                      srcSet={sources.srcSet}
                      sizes="(max-width: 767px) 33vw, (max-width: 1023px) 25vw, 16vw"
                      alt={item.description || t('media.photoAlt')}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />

                    {isVideo && (
                      <>
                        <div className="absolute inset-0 bg-black/25" />
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="h-8 w-8 bg-white/25 backdrop-blur-sm rounded-full flex items-center justify-center border border-white/40">
                            <Play className="h-4 w-4 text-white fill-white ml-0.5" />
                          </div>
                        </div>
                        {duration ? (
                          <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1 py-0.5 rounded font-mono">
                            {formatDuration(duration)}
                          </div>
                        ) : null}
                      </>
                    )}

                    {selectable && (
                      <div
                        className={cn(
                          'absolute top-1.5 left-1.5 z-20 flex items-center justify-center h-6 w-6 rounded-full border-2',
                          isSelected
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'bg-white/80 border-white'
                        )}
                      >
                        {isSelected && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                      </div>
                    )}

                    {!selectable && !readOnly && (
                      <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 md:group-hover:opacity-100 z-20">
                        <Button
                          size="icon"
                          variant="secondary"
                          className="h-7 w-7 rounded-full bg-white/90"
                          onClick={(event) => handleTagClick(event, item)}
                          aria-label={t('media.capture.tags')}
                        >
                          <Tag className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="destructive"
                          className="h-7 w-7 rounded-full"
                          onClick={(event) => handleDelete(event, item)}
                          aria-label={t('media.viewerDelete')}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}

                    <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-gradient-to-t from-black/75 to-transparent pointer-events-none">
                      <div className="flex items-end justify-between gap-1">
                        <span className="text-[10px] text-white/95 font-medium flex items-center gap-1">
                          {isVideo && <Video className="h-3 w-3" />}
                          {formatCaptureClock(item, language)}
                        </span>
                        {!readOnly && (
                          <Avatar className="h-5 w-5 border border-white/30">
                            <AvatarFallback className="text-[8px] bg-white/90 text-gray-900 font-bold">
                              {item.uploaded_by_profile?.initials || 'NA'}
                            </AvatarFallback>
                          </Avatar>
                        )}
                      </div>
                      {item.media_tags && item.media_tags.length > 0 && (
                        <span
                          data-testid="tag-count"
                          className="inline-flex items-center gap-0.5 text-[10px] text-white/90"
                        >
                          <Tag className="h-3 w-3 shrink-0" aria-hidden="true" />
                          {t('media.tagsCount', { count: item.media_tags.length })}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {showViewer && selectedMedia && (
        <MediaViewer
          media={selectedMedia}
          allMedia={media}
          onClose={() => setShowViewer(false)}
          onDelete={readOnly ? undefined : async (item) => {
            const removed = await handleDelete(null, item);
            if (removed) setShowViewer(false);
          }}
        />
      )}

      {showTagManager && taggedMedia && !readOnly && (
        <TagManager
          media={taggedMedia}
          projectId={projectId}
          onClose={() => setShowTagManager(false)}
          onSuccess={() => {
            if (onRefresh) onRefresh();
            setShowTagManager(false);
          }}
        />
      )}
    </>
  );
};

export default MediaGrid;
