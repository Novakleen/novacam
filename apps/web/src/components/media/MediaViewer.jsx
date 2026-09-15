import React, { useState, useEffect } from 'react';
import { X, Download, ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';

const MediaViewer = ({ media, allMedia, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(
    allMedia.findIndex(m => m.id === media.id)
  );
  const [zoom, setZoom] = useState(1);
  const currentMedia = allMedia[currentIndex];

  useEffect(() => {
    setZoom(1);
  }, [currentIndex]);

  const handlePrevious = (e) => {
    e?.stopPropagation();
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleNext = (e) => {
    e?.stopPropagation();
    if (currentIndex < allMedia.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowLeft') handlePrevious();
    if (e.key === 'ArrowRight') handleNext();
    if (e.key === 'Escape') onClose();
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex]);

  const handleDownload = async (e) => {
    e.stopPropagation();
    try {
      const response = await fetch(currentMedia.file_url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `media-${currentMedia.id}.${currentMedia.file_type === 'video' ? 'mp4' : 'jpg'}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download failed:', error);
      window.open(currentMedia.file_url, '_blank');
    }
  };

  const handleZoomIn = (e) => {
    e.stopPropagation();
    if (currentMedia.file_type !== 'video') {
       setZoom(prev => Math.min(prev + 0.25, 3));
    }
  };

  const handleZoomOut = (e) => {
    e.stopPropagation();
    if (currentMedia.file_type !== 'video') {
       setZoom(prev => Math.max(prev - 0.25, 1));
    }
  };

  const isVideo = currentMedia.file_type === 'video';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center backdrop-blur-md"
        onClick={onClose}
      >
        {/* Mobile Header / Desktop Toolbar */}
        <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-[110] bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-2">
             <span className="text-white/90 text-sm font-medium px-3 py-1 bg-white/10 rounded-full backdrop-blur-md">
                {currentIndex + 1} / {allMedia.length}
             </span>
          </div>
          
          <div className="flex gap-2 pointer-events-auto">
            {!isVideo && (
                <div className="hidden sm:flex gap-2 mr-2 border-r border-white/20 pr-2">
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-white hover:bg-white/20 rounded-full" onClick={handleZoomIn}>
                    <ZoomIn className="h-5 w-5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-white hover:bg-white/20 rounded-full" onClick={handleZoomOut}>
                    <ZoomOut className="h-5 w-5" />
                    </Button>
                </div>
            )}
            <Button variant="ghost" size="icon" className="h-9 w-9 text-white hover:bg-white/20 rounded-full" onClick={handleDownload}>
              <Download className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-9 w-9 text-white hover:bg-red-500/20 hover:text-red-400 rounded-full" onClick={onClose}>
              <X className="h-6 w-6" />
            </Button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 w-full relative flex items-center justify-center overflow-hidden" onClick={(e) => e.stopPropagation()}>
          
          {currentIndex > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-2 sm:left-4 z-[105] text-white/70 hover:text-white hover:bg-white/10 rounded-full h-10 w-10 sm:h-12 sm:w-12 flex items-center justify-center transition-all"
              onClick={handlePrevious}
            >
              <ChevronLeft className="h-6 w-6 sm:h-8 sm:w-8" />
            </Button>
          )}

          <motion.div
            key={currentMedia.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="w-full h-full flex items-center justify-center p-2 sm:p-8 md:p-12"
          >
            {isVideo ? (
              <div className="relative w-full max-w-5xl aspect-video bg-black rounded-lg overflow-hidden shadow-2xl ring-1 ring-white/10">
                 <video
                    src={currentMedia.file_url}
                    controls
                    autoPlay
                    playsInline
                    className="w-full h-full object-contain"
                    onClick={(e) => e.stopPropagation()}
                  >
                      <p className="text-white text-center">Your browser does not support the video tag.</p>
                  </video>
              </div>
            ) : (
              <img
                src={currentMedia.file_url}
                alt="Media"
                className="max-w-full max-h-full object-contain shadow-2xl select-none"
                style={{ transform: `scale(${zoom})`, transition: 'transform 0.2s ease-out' }}
                draggable={false}
              />
            )}
          </motion.div>

          {currentIndex < allMedia.length - 1 && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 sm:right-4 z-[105] text-white/70 hover:text-white hover:bg-white/10 rounded-full h-10 w-10 sm:h-12 sm:w-12 flex items-center justify-center transition-all"
              onClick={handleNext}
            >
              <ChevronRight className="h-6 w-6 sm:h-8 sm:w-8" />
            </Button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default MediaViewer;