import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Play, Tag, Trash2, Check, Video, Clock } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import MediaViewer from '@/components/media/MediaViewer';
import TagManager from '@/components/media/TagManager';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Utility function for date formatting
const format = (date, formatStr) => {
  const d = new Date(date);
  const map = {
    'yyyy': d.getFullYear(),
    'MM': String(d.getMonth() + 1).padStart(2, '0'),
    'dd': String(d.getDate()).padStart(2, '0'),
    'd': d.getDate(),
    'HH': String(d.getHours()).padStart(2, '0'),
    'mm': String(d.getMinutes()).padStart(2, '0'),
  };

  if (formatStr === 'MMMM d, yyyy') {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                   'July', 'August', 'September', 'October', 'November', 'December'];
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  }

  return formatStr.replace(/yyyy|MM|dd|HH|mm/g, (match) => map[match]);
};

const formatDuration = (seconds) => {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const MediaCardSkeleton = () => (
  <div className="relative aspect-video rounded-xl overflow-hidden bg-gray-200 dark:bg-gray-800 animate-pulse">
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="w-12 h-12 rounded-full bg-gray-300 dark:bg-gray-700/50" />
    </div>
    <div className="absolute bottom-0 left-0 right-0 p-3">
      <div className="h-3 w-1/3 bg-gray-300 dark:bg-gray-700/50 rounded mb-1" />
      <div className="h-2 w-1/4 bg-gray-300 dark:bg-gray-700/50 rounded" />
    </div>
  </div>
);

const MediaGrid = ({ 
  media, 
  onRefresh, 
  projectId, 
  selectable = false,
  selectedIds = [],
  onToggleSelect,
  readOnly = false,
  isLoading = false
}) => {
  const { toast } = useToast();
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [showViewer, setShowViewer] = useState(false);
  const [showTagManager, setShowTagManager] = useState(false);
  const [taggedMedia, setTaggedMedia] = useState(null);

  const groupedMedia = media.reduce((acc, item) => {
    const date = format(new Date(item.created_at), 'yyyy-MM-dd');
    if (!acc[date]) acc[date] = [];
    acc[date].push(item);
    return acc;
  }, {});

  const handleMediaClick = (item) => {
    if (selectable && onToggleSelect) {
      onToggleSelect(item.id);
    } else {
      setSelectedMedia(item);
      setShowViewer(true);
    }
  };

  const handleTagClick = (e, item) => {
    e.stopPropagation();
    setTaggedMedia(item);
    setShowTagManager(true);
  };

  const handleDelete = async (e, mediaId) => {
    e.stopPropagation();
    if (readOnly) return;
    
    if (!window.confirm('Are you sure you want to delete this media?')) return;

    try {
      const { error } = await supabase
        .from('media')
        .delete()
        .eq('id', mediaId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Media deleted successfully",
      });

      if (onRefresh) onRefresh();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete media",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-8">
        {[1, 2].map((i) => (
          <div key={i}>
            <div className="h-4 w-32 bg-gray-200 dark:bg-gray-800 rounded animate-pulse mb-4" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((j) => (
                <MediaCardSkeleton key={j} />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (media.length === 0) {
    return (
      <div className="text-center py-24 bg-white dark:bg-gray-800/50 rounded-3xl border border-dashed border-gray-200 dark:border-gray-700">
        <p className="text-gray-500 dark:text-gray-400 font-medium">
          No photos or videos yet.
        </p>
        {!readOnly && (
           <p className="text-sm text-gray-400 mt-1">Upload media to see them here.</p>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="space-y-8">
        {Object.entries(groupedMedia)
          .sort(([a], [b]) => b.localeCompare(a))
          .map(([date, items]) => (
            <div key={date}>
              <div className="sticky top-[120px] md:top-[64px] z-10 bg-gray-50/95 dark:bg-gray-900/95 py-3 mb-2 backdrop-blur-sm">
                 <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    {format(new Date(date), 'MMMM d, yyyy')}
                 </h3>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                {items.map((item, index) => {
                  const isSelected = selectedIds.includes(item.id);
                  const isVideo = item.file_type === 'video';
                  const thumbnailUrl = item.thumbnail_url || item.file_url;
                  const duration = item.duration;

                  return (
                    <motion.div
                      key={item.id}
                      layoutId={item.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.2, delay: index * 0.05 }}
                      className={cn(
                        "relative aspect-video rounded-2xl overflow-hidden cursor-pointer group bg-gray-200 dark:bg-gray-800 shadow-sm hover:shadow-md transition-all duration-300",
                        isSelected && "ring-4 ring-blue-500 ring-offset-2 ring-offset-white dark:ring-offset-gray-900",
                        selectable && !isSelected && "hover:opacity-90"
                      )}
                      onClick={() => handleMediaClick(item)}
                    >
                      <img
                        src={thumbnailUrl}
                        alt="Media content"
                        className={cn(
                          "w-full h-full object-cover transition-transform duration-700 will-change-transform",
                          !selectable && "group-hover:scale-105"
                        )}
                        loading="lazy"
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      />

                      {/* Video Overlay */}
                      {isVideo && (
                        <>
                          <div className="absolute inset-0 bg-black/20 group-hover:bg-black/30 transition-colors duration-300" />
                          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                            <div className="h-14 w-14 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center border border-white/40 shadow-xl group-hover:scale-110 transition-transform duration-300">
                              <Play className="h-6 w-6 text-white fill-white ml-1" />
                            </div>
                          </div>
                          
                          {/* Duration Badge */}
                          {duration && (
                            <div className="absolute bottom-3 right-3 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded-md font-bold tracking-wide flex items-center gap-1 backdrop-blur-sm z-10">
                               <span className="font-mono">{formatDuration(duration)}</span>
                            </div>
                          )}
                        </>
                      )}
                      
                      {/* Selection Checkbox */}
                      {selectable && (
                        <div className={cn(
                          "absolute top-3 left-3 z-20 flex items-center justify-center h-7 w-7 rounded-full border-2 transition-all duration-200 shadow-lg",
                          isSelected 
                            ? "bg-blue-600 border-blue-600 text-white" 
                            : "bg-white/80 border-white hover:bg-white hover:border-blue-400 backdrop-blur-sm"
                        )}>
                          {isSelected && <Check className="h-4 w-4 stroke-[3]" />}
                        </div>
                      )}

                      {/* Desktop Hover Actions */}
                      {!selectable && !readOnly && (
                        <div className="absolute top-3 right-3 flex flex-col gap-2 opacity-0 md:group-hover:opacity-100 transition-opacity duration-200 z-20">
                            <Button
                              size="icon"
                              variant="secondary"
                              className="h-9 w-9 rounded-xl shadow-lg bg-white/90 hover:bg-white text-gray-700"
                              onClick={(e) => handleTagClick(e, item)}
                            >
                              <Tag className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="destructive"
                              className="h-9 w-9 rounded-xl shadow-lg"
                              onClick={(e) => handleDelete(e, item.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                      )}

                      {/* Bottom Info Bar */}
                      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none">
                        <div className="flex items-end justify-between">
                          <div className="flex flex-col">
                             <span className="text-xs text-white/95 font-medium drop-shadow-sm flex items-center gap-1">
                               {isVideo && <Video className="h-3 w-3 inline opacity-75" />}
                               {format(new Date(item.created_at), 'HH:mm')}
                             </span>
                             {item.media_tags && item.media_tags.length > 0 && (
                                <div className="flex items-center gap-1.5 mt-1">
                                   <div className="h-1.5 w-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]"></div>
                                   <span className="text-[10px] text-white/80 font-medium">{item.media_tags.length} tags</span>
                                </div>
                             )}
                          </div>
                          {!readOnly && (
                            <Avatar className="h-7 w-7 border-2 border-white/20 shadow-md">
                              <AvatarFallback className="text-[9px] bg-white/90 text-gray-900 font-bold">
                                {item.uploaded_by_profile?.initials || 'NA'}
                              </AvatarFallback>
                            </Avatar>
                          )}
                        </div>
                      </div>
                    </motion.div>
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