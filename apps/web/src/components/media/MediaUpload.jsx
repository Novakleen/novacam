import React, { useState, useRef } from 'react';
import { Upload, Image as ImageIcon, Video, X, File } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUpload } from '@/contexts/UploadContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

const MediaUpload = ({ projectId, onClose, onSuccess }) => {
  const { addUpload } = useUpload();
  const { toast } = useToast();
  const [files, setFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const handleFileSelect = (selectedFiles) => {
    const fileArray = Array.from(selectedFiles);
    
    // Validate files
    const validFiles = fileArray.filter(file => {
      const isImage = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/');
      return isImage || isVideo;
    });
    
    if (validFiles.length !== fileArray.length) {
      toast({
        variant: "destructive",
        title: "Invalid file type",
        description: "Some files were skipped. Only images and videos are allowed."
      });
    }
    
    setFiles(prev => [...prev, ...validFiles]);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files);
    }
  };

  const handleRemoveFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleStartUpload = () => {
    if (files.length === 0) return;

    files.forEach(file => {
      addUpload(file, projectId);
    });

    toast({
      title: "Uploads started",
      description: `${files.length} file${files.length > 1 ? 's' : ''} added to upload queue.`
    });

    if (onSuccess) onSuccess();
    onClose();
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl w-[calc(100vw-2rem)] mx-4 sm:mx-auto rounded-2xl p-0 gap-0 overflow-hidden max-h-[90vh] flex flex-col">
        <DialogHeader className="px-4 sm:px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800">
          <DialogTitle className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Upload Media</DialogTitle>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Add photos and videos to your project</p>
        </DialogHeader>

        <div className="px-4 sm:px-6 py-4 space-y-4 overflow-y-auto flex-1">
          {/* Drop Zone */}
          <div
            className={cn(
              "relative border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center cursor-pointer transition-all duration-200 min-h-[160px] sm:min-h-[200px] flex flex-col items-center justify-center",
              isDragging 
                ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20 scale-[1.02]" 
                : "border-gray-300 dark:border-gray-600 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-900/50 hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-lg"
            )}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <motion.div
              initial={{ scale: 1 }}
              animate={{ scale: isDragging ? 1.1 : 1 }}
              transition={{ duration: 0.2 }}
              className="space-y-3"
            >
              <div className={cn(
                "mx-auto w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center transition-colors",
                isDragging 
                  ? "bg-blue-500 text-white" 
                  : "bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg"
              )}>
                <Upload className="h-8 w-8 sm:h-10 sm:w-10" />
              </div>
              
              <div className="space-y-1">
                <p className="text-base sm:text-lg font-semibold text-gray-700 dark:text-gray-300">
                  {isDragging ? "Drop files here" : "Click or drag files to upload"}
                </p>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 px-4">
                  Supports JPG, PNG, MP4, MOV • Background uploading enabled
                </p>
              </div>
            </motion.div>
            
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*"
              onChange={(e) => handleFileSelect(e.target.files)}
              className="hidden"
            />
          </div>

          {/* Selected Files List */}
          <AnimatePresence mode="popLayout">
            {files.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-3"
              >
                <div className="flex justify-between items-center px-1">
                  <p className="font-semibold text-sm sm:text-base text-gray-900 dark:text-white">
                    Selected Files ({files.length})
                  </p>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setFiles([])} 
                    className="h-8 text-xs sm:text-sm text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                  >
                    Clear all
                  </Button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent">
                  <AnimatePresence mode="popLayout">
                    {files.map((file, index) => (
                      <motion.div
                        key={`${file.name}-${index}`}
                        initial={{ opacity: 0, scale: 0.8, y: -20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.8, x: -100 }}
                        transition={{ duration: 0.2, delay: index * 0.03 }}
                        layout
                        className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm hover:shadow-md transition-shadow group"
                      >
                        {file.type.startsWith('image/') ? (
                          <div className="shrink-0 p-2.5 bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900/30 dark:to-blue-800/30 rounded-lg">
                            <ImageIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                          </div>
                        ) : (
                          <div className="shrink-0 p-2.5 bg-gradient-to-br from-purple-100 to-purple-200 dark:from-purple-900/30 dark:to-purple-800/30 rounded-lg">
                            <Video className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                          </div>
                        )}
                        
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate" title={file.name}>
                            {file.name}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            {formatFileSize(file.size)}
                          </p>
                        </div>
                        
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 shrink-0 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 opacity-0 group-hover:opacity-100 transition-all"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveFile(index);
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer Actions */}
        <div className="px-4 sm:px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 backdrop-blur-sm">
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3">
            <Button 
              variant="outline" 
              onClick={onClose} 
              className="h-11 sm:h-10 rounded-xl text-sm sm:text-base border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Cancel
            </Button>
            <Button
              onClick={handleStartUpload}
              disabled={files.length === 0}
              className="h-11 sm:h-10 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-lg shadow-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none text-sm sm:text-base font-semibold px-6"
            >
              <Upload className="mr-2 h-4 w-4" />
              Start Upload {files.length > 0 && `(${files.length})`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MediaUpload;