import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Minimize2, Maximize2, Loader2, CheckCircle2, AlertCircle, 
  Rocket, AlertTriangle, RefreshCw
} from 'lucide-react';
import { useUpload } from '@/contexts/UploadContext';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

const formatBytes = (bytes, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const formatTime = (seconds) => {
  if (!seconds || seconds === Infinity) return '--';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
};

const UploadItem = ({ upload, onCancel, onRemove }) => {
  const isCompleted = upload.status === 'completed';
  const isError = upload.status === 'error';
  const isUploading = upload.status === 'uploading';
  const isCompressing = upload.status === 'compressing';
  const isQueued = upload.status === 'queued';
  const isFinalizing = upload.status === 'finalizing';
  const isRetrying = upload.status === 'retrying';
  const isCancelled = upload.status === 'cancelled';

  // Check for stall: If uploading but no update for > 30s
  const isStalled = (isUploading || isFinalizing) && 
                    upload.lastUpdated && 
                    (Date.now() - upload.lastUpdated > 30000);

  return (
    <div className="bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-100 dark:border-gray-700 shadow-sm mb-2 relative overflow-hidden group">
      
      <div className="flex items-start justify-between gap-3 relative z-10">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {isCompleted ? (
              <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
            ) : isError ? (
              <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
            ) : isCompressing ? (
              <Loader2 className="h-4 w-4 text-yellow-500 animate-spin shrink-0" />
            ) : isQueued ? (
              <div className="h-4 w-4 rounded-full border-2 border-gray-300 shrink-0" />
            ) : isRetrying ? (
              <RefreshCw className="h-4 w-4 text-orange-500 animate-spin shrink-0" />
            ) : (
              <Loader2 className="h-4 w-4 text-blue-500 animate-spin shrink-0" />
            )}
            
            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate flex-1" title={upload.fileName}>
              {upload.fileName}
            </h4>
            
            {isStalled && !isCompleted && !isError && (
              <span className="text-[10px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Stalled
              </span>
            )}
          </div>
          
          {/* Progress Bar */}
          {!isCompleted && !isCancelled && !isError && (
             <Progress value={upload.progress} className="h-1.5 mb-2" />
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
            <span>{formatBytes(upload.size)}</span>
            
            {isCompressing && <span className="text-yellow-600">Compressing...</span>}
            {isQueued && <span className="text-gray-400">Queued</span>}
            {isCancelled && <span className="text-gray-400">Cancelled</span>}
            
            {(isUploading || isFinalizing || isRetrying) && (
              <>
                <span className="font-medium text-gray-700 dark:text-gray-300">
                    {upload.progress}%
                </span>
                
                {isFinalizing ? (
                    <span className="text-blue-600 animate-pulse">Processing...</span>
                ) : isRetrying ? (
                    <span className="text-orange-600">Retrying connection...</span>
                ) : (
                    <>
                        <span className="flex items-center gap-1">
                        {upload.speed > 5000000 && <Rocket className="h-3 w-3 text-orange-500" />}
                        {formatBytes(upload.speed)}/s
                        </span>
                        <span>ETA: {formatTime(upload.eta)}</span>
                    </>
                )}
              </>
            )}
          </div>
          
          {isError && (
            <p className="text-xs text-red-500 mt-1">{upload.error || 'Upload failed'}</p>
          )}
        </div>

        <div className="flex items-center gap-1">
          {(!isCompleted && !isError && !isCancelled) && (
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-7 w-7 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
              onClick={() => onCancel(upload.id)}
              title="Cancel Upload"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
          
          {(isCompleted || isError || isCancelled) && (
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-7 w-7 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              onClick={() => onRemove(upload.id)}
              title="Dismiss"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

const UploadManager = () => {
  const { uploads, isExpanded, setIsExpanded, cancelUpload, removeUpload, clearCompleted } = useUpload();
  const uploadList = Object.values(uploads);
  
  // Statuses considered "active" for the header summary
  const activeUploads = uploadList.filter(u => 
    ['uploading', 'queued', 'compressing', 'finalizing', 'retrying'].includes(u.status)
  );
  
  const hasUploads = uploadList.length > 0;
  const allFinished = hasUploads && activeUploads.length === 0;
  
  // Auto-close dialog when all uploads are finished
  useEffect(() => {
    let timeout;
    if (allFinished && isExpanded) {
      timeout = setTimeout(() => {
        setIsExpanded(false);
      }, 5000); // Give user 5s to see success state before minimizing
    }
    return () => clearTimeout(timeout);
  }, [allFinished, isExpanded, setIsExpanded]);

  if (!hasUploads) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[60] flex flex-col items-end pointer-events-none">
      <div className="pointer-events-auto shadow-2xl rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 w-80 md:w-96 overflow-hidden flex flex-col max-h-[600px] transition-all duration-300">
        {/* Header */}
        <div 
          className="bg-gray-50 dark:bg-gray-800/80 p-3 flex items-center justify-between cursor-pointer border-b border-gray-100 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2.5">
            {activeUploads.length > 0 ? (
               <div className="relative">
                  <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
                  {activeUploads.some(u => u.status === 'finalizing') && (
                     <span className="absolute -top-1 -right-1 h-2 w-2 bg-blue-500 rounded-full animate-ping" />
                  )}
               </div>
            ) : (
               <CheckCircle2 className="h-4 w-4 text-green-500" />
            )}
            <div className="flex flex-col leading-none">
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                {activeUploads.length > 0 
                    ? `${activeUploads.length} Uploading` 
                    : 'Uploads Completed'}
                </span>
                {activeUploads.length > 0 && (
                    <span className="text-[10px] text-gray-500 mt-0.5">
                        {Math.round(activeUploads.reduce((acc, curr) => acc + (curr.progress || 0), 0) / activeUploads.length)}% overall
                    </span>
                )}
            </div>
          </div>
          <div className="flex items-center gap-1">
             <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700">
               {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
             </Button>
          </div>
        </div>

        {/* Content */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col bg-gray-50/50 dark:bg-gray-900/50"
            >
              <div className="flex-1 overflow-y-auto max-h-[400px] p-3 space-y-2 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-700">
                {uploadList.sort((a,b) => b.startTime - a.startTime).map(upload => (
                  <UploadItem 
                    key={upload.id} 
                    upload={upload} 
                    onCancel={cancelUpload}
                    onRemove={removeUpload}
                  />
                ))}
              </div>
              
              {uploadList.some(u => ['completed', 'cancelled', 'error'].includes(u.status)) && (
                <div className="p-2 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="w-full text-xs text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white h-8"
                    onClick={clearCompleted}
                  >
                    Clear finished
                  </Button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default UploadManager;