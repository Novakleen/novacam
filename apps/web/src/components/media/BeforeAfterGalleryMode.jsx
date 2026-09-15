import React, { useState } from 'react';
import { Check, ImageOff, RefreshCw } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Simple Image Component with Loading & Error states
const GalleryImage = ({ src, alt, isSelected, onClick }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const handleRetry = (e) => {
    e.stopPropagation();
    setIsLoading(true);
    setHasError(false);
    // Force reload by appending timestamp
    const img = new Image();
    img.src = src;
    img.onload = () => setIsLoading(false);
    img.onerror = () => {
       setIsLoading(false);
       setHasError(true);
    };
  };

  return (
    <div 
      onClick={!hasError ? onClick : undefined}
      className={cn(
        "group relative rounded-lg overflow-hidden cursor-pointer border-2 transition-all bg-gray-100 dark:bg-gray-800",
        isSelected 
          ? "border-blue-500 ring-2 ring-blue-200 dark:ring-blue-900 shadow-md scale-[0.98]" 
          : "border-transparent hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm"
      )}
      role="button"
      aria-pressed={isSelected}
      aria-label={`Select photo: ${alt || 'Project media'}`}
    >
      {/* Aspect Ratio Container - using a fixed aspect ratio for consistency */}
      <div className="aspect-square w-full relative">
        
        {/* Loading Skeleton */}
        {isLoading && (
          <div className="absolute inset-0 bg-gray-200 dark:bg-gray-700 animate-pulse flex items-center justify-center">
             <div className="w-6 h-6 rounded-full bg-gray-300 dark:bg-gray-600" />
          </div>
        )}

        {/* Error State */}
        {hasError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-2 text-center bg-gray-50 dark:bg-gray-800 text-gray-400">
            <ImageOff className="h-6 w-6 mb-1 opacity-50" />
            <Button variant="ghost" size="icon" className="h-6 w-6 text-xs" onClick={handleRetry}>
               <RefreshCw className="h-3 w-3" />
            </Button>
          </div>
        )}

        {/* Actual Image */}
        {!hasError && (
          <img 
            src={src} 
            alt={alt || "Project photo"}
            className={cn(
              "w-full h-full object-cover transition-opacity duration-300",
              isLoading ? "opacity-0" : "opacity-100"
            )}
            onLoad={() => setIsLoading(false)}
            onError={() => {
              setIsLoading(false);
              setHasError(true);
            }}
          />
        )}

        {/* Selection Overlay */}
        {isSelected && (
          <div className="absolute inset-0 bg-blue-500/30 z-10 flex items-center justify-center animate-in fade-in duration-200">
            <div className="bg-blue-600 text-white rounded-full p-1.5 shadow-lg scale-110">
              <Check className="w-4 h-4" />
            </div>
          </div>
        )}
        
        {/* Hover Overlay (Desktop) */}
        {!isSelected && !hasError && (
           <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none" />
        )}
      </div>
    </div>
  );
};

const BeforeAfterGalleryMode = ({ projectMedia, onSelect, selectedId, onCancel, title }) => {
  return (
    <div className="flex flex-col h-full max-h-[90vh] bg-white dark:bg-gray-950">
      {/* Fixed Header */}
      <div className="flex-none p-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center bg-white dark:bg-gray-950 z-10">
        <div>
          <h3 className="font-semibold text-lg text-gray-900 dark:text-gray-100 line-clamp-1">{title || 'Select Photo'}</h3>
          <p className="text-xs md:text-sm text-gray-500 line-clamp-1">Choose from gallery</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onCancel} className="shrink-0 ml-2">Cancel</Button>
      </div>
      
      {/* Scrollable Content Area */}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        <ScrollArea className="h-full w-full">
          <div className="p-4">
            {projectMedia.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 md:py-24 text-gray-500 text-center px-4">
                <div className="w-12 h-12 md:w-16 md:h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                   <ImageOff className="h-6 w-6 md:h-8 md:w-8 text-gray-400" />
                </div>
                <p className="font-medium text-base md:text-lg">No photos found</p>
                <p className="text-xs md:text-sm max-w-xs mt-1">
                  Upload photos to create a comparison.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 md:gap-3 pb-20">
                {projectMedia.map((media) => (
                  <GalleryImage
                    key={media.id}
                    src={media.thumbnail_url || media.file_url}
                    alt={media.description}
                    isSelected={media.id === selectedId}
                    onClick={() => onSelect(media)}
                  />
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
      
      {/* Fixed Footer */}
      <div className="flex-none p-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 text-xs text-center text-gray-500">
         {projectMedia.length} photo{projectMedia.length !== 1 ? 's' : ''} available
      </div>
    </div>
  );
};

export default BeforeAfterGalleryMode;