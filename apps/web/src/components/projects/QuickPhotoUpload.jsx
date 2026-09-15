import React, { useState, useRef } from 'react';
import { Loader2, Upload, X, Image as ImageIcon, Camera, FileVideo } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import AdvancedPhotoUploadDialog from '@/components/capture/AdvancedPhotoUploadDialog';

const QuickPhotoUpload = ({ projectId, open, onOpenChange, onSuccess, initialMode = 'simple' }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [activeMode, setActiveMode] = useState(initialMode); // 'simple', 'advanced', 'video'
  const [videoFileToPass, setVideoFileToPass] = useState(null);

  const SUPPORTED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo', 'video/x-matroska'];
  const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

  const validateFile = (file) => {
     if (file.type.startsWith('image/')) {
        if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) {
            toast({ variant: "destructive", title: "Unsupported Image", description: "Use JPG, PNG, GIF, WEBP." });
            return false;
        }
        return true;
     } else if (file.type.startsWith('video/')) {
        if (!SUPPORTED_VIDEO_TYPES.includes(file.type) && !file.name.endsWith('.mkv')) { // mime type for mkv varies
            toast({ variant: "destructive", title: "Unsupported Video", description: "Use MP4, MOV, WEBM, AVI, MKV." });
            return false;
        }
        if (file.size > 500 * 1024 * 1024) {
            toast({ variant: "destructive", title: "File Too Large", description: "Video must be under 500MB." });
            return false;
        }
        return true;
     }
     return false;
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(Array.from(e.target.files));
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(Array.from(e.dataTransfer.files));
    }
  };

  const processFiles = (newFiles) => {
      // Check for video first
      const videoFile = newFiles.find(f => f.type.startsWith('video/') || f.name.endsWith('.mkv'));
      
      if (videoFile) {
          if (validateFile(videoFile)) {
              if (newFiles.length > 1) {
                  toast({ title: "Note", description: "Video detected. Uploading video only." });
              }
              setVideoFileToPass(videoFile);
              setActiveMode('video');
          }
          return;
      }

      // Handle images
      const validImages = newFiles.filter(f => f.type.startsWith('image/') && validateFile(f));
      if (validImages.length > 0) {
          setFiles(prev => [...prev, ...validImages]);
      }
  };

  const removeFile = (index) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploading(true);
    setProgress(0);

    let successCount = 0;
    const totalFiles = files.length;

    try {
      for (let i = 0; i < totalFiles; i++) {
        const file = files[i];
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `${projectId}/${fileName}`;

        // 1. Upload to Storage
        const { error: uploadError } = await supabase.storage
          .from('project-media')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        // 2. Get Public URL
        const { data: { publicUrl } } = supabase.storage
          .from('project-media')
          .getPublicUrl(filePath);

        // 3. Insert into DB
        const { error: dbError } = await supabase
          .from('media')
          .insert({
            project_id: projectId,
            uploaded_by: user.id,
            file_url: publicUrl,
            file_type: 'image',
            thumbnail_url: publicUrl 
          });

        if (dbError) throw dbError;

        successCount++;
        setProgress(Math.round(((i + 1) / totalFiles) * 100));
      }

      toast({
        title: "Upload Complete",
        description: `Successfully uploaded ${successCount} photo${successCount !== 1 ? 's' : ''}.`,
      });

      setFiles([]);
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error('Quick upload error:', error);
      toast({
        variant: "destructive",
        title: "Upload Failed",
        description: "An error occurred while uploading photos.",
      });
    } finally {
      setUploading(false);
    }
  };

  if (activeMode === 'advanced' || activeMode === 'video') {
      return (
          <AdvancedPhotoUploadDialog 
            open={open} 
            onClose={() => {
                setActiveMode('simple');
                setVideoFileToPass(null);
                onOpenChange(false);
            }}
            projectId={projectId}
            onSuccess={onSuccess}
            initialFiles={videoFileToPass ? [videoFileToPass] : []}
            defaultMode={activeMode === 'video' ? 'video' : 'photo'}
          />
      );
  }

  return (
    <Dialog open={open} onOpenChange={(val) => !uploading && onOpenChange(val)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Quick Media Upload</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
          >
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              multiple
              accept="image/*,video/mp4,video/quicktime,video/webm,video/x-msvideo,video/x-matroska"
              onChange={handleFileSelect}
            />
            <div className="h-12 w-12 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center mb-3 group">
              <Upload className="h-6 w-6 text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform" />
            </div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
              Click to select or drag files here
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-[200px]">
              Supports JPG, PNG, GIF for images. MP4, MOV, AVI, WEBM for videos (max 500MB).
            </p>
          </div>

          <div className="relative">
             <div className="absolute inset-0 flex items-center">
               <span className="w-full border-t border-gray-200 dark:border-gray-700" />
             </div>
             <div className="relative flex justify-center text-xs uppercase">
               <span className="bg-white dark:bg-gray-950 px-2 text-gray-500">Or</span>
             </div>
          </div>
          
          <Button 
            variant="outline" 
            className="w-full py-6 h-auto flex flex-col items-center gap-2 border-dashed hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/10"
            onClick={() => setActiveMode('advanced')}
          >
             <Camera className="h-6 w-6" />
             <div className="text-xs font-semibold">Open Camera & Annotate</div>
          </Button>

          {files.length > 0 && (
            <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
              {files.map((file, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm">
                  <div className="flex items-center gap-2 overflow-hidden">
                    {file.type.startsWith('video/') ? (
                        <FileVideo className="h-4 w-4 flex-shrink-0 text-blue-500" />
                    ) : (
                        <ImageIcon className="h-4 w-4 flex-shrink-0 text-gray-400" />
                    )}
                    <span className="truncate max-w-[200px]">{file.name}</span>
                  </div>
                  <button 
                    onClick={() => removeFile(idx)}
                    disabled={uploading}
                    className="text-gray-400 hover:text-red-500"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
             <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={uploading}>
               Cancel
             </Button>
             <Button onClick={handleUpload} disabled={files.length === 0 || uploading} className="min-w-[100px]">
               {uploading ? (
                 <>
                   <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                   {progress}%
                 </>
               ) : (
                 'Upload'
               )}
             </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default QuickPhotoUpload;