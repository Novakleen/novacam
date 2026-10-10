import React, { useState, useRef } from 'react';
import { Loader2, Upload, X, Image as ImageIcon, Camera, FileVideo } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import AdvancedPhotoUploadDialog from '@/components/capture/AdvancedPhotoUploadDialog';
import { uploadProjectImage } from '@/lib/uploadProjectImage';
import { isImageFile } from '@/lib/imageSizes';
import { useVideoUpload } from '@/hooks/useVideoUpload';
import { useTranslation } from 'react-i18next';

const QuickPhotoUpload = ({ projectId, open, onOpenChange, onSuccess, initialMode = 'simple' }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const fileInputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [activeMode, setActiveMode] = useState(initialMode);
  const [videoFileToPass, setVideoFileToPass] = useState(null);
  const { uploadVideo } = useVideoUpload(projectId, user?.id);

  const SUPPORTED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo', 'video/x-matroska'];

  const validateFile = (file) => {
    if (isImageFile(file)) return true;
    if (file.type?.startsWith('image/')) {
      toast({ variant: 'destructive', title: t('common.error'), description: t('media.quick.unsupportedImage') });
      return false;
    }
    if (file.type?.startsWith('video/') || file.name?.toLowerCase().endsWith('.mkv')) {
      if (!SUPPORTED_VIDEO_TYPES.includes(file.type) && !file.name.toLowerCase().endsWith('.mkv')) {
        toast({ variant: 'destructive', title: t('common.error'), description: t('media.quick.unsupportedVideo') });
        return false;
      }
      if (file.size > 500 * 1024 * 1024) {
        toast({ variant: 'destructive', title: t('common.error'), description: t('media.quick.videoTooLarge') });
        return false;
      }
      return true;
    }
    return false;
  };

  const processFiles = (newFiles) => {
    const videoFile = newFiles.find((file) => file.type?.startsWith('video/') || file.name?.toLowerCase().endsWith('.mkv'));
    if (videoFile) {
      if (validateFile(videoFile)) {
        if (newFiles.length > 1) {
          toast({ title: t('common.success'), description: t('media.quick.videoOnly') });
        }
        setVideoFileToPass(videoFile);
        setActiveMode('video');
      }
      return;
    }

    const validImages = newFiles.filter((file) => isImageFile(file) && validateFile(file));
    if (validImages.length > 0) setFiles((prev) => [...prev, ...validImages]);
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploading(true);
    setProgress(0);
    let successCount = 0;

    try {
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        if (file.type?.startsWith('video/')) {
          await uploadVideo(file);
        } else {
          await uploadProjectImage(file, {
            projectId,
            userId: user.id,
          });
        }
        successCount += 1;
        setProgress(Math.round(((i + 1) / files.length) * 100));
      }

      toast({
        title: t('common.success'),
        description: t('media.quick.done', { count: successCount }),
      });
      setFiles([]);
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error('Quick upload error:', error);
      toast({
        variant: 'destructive',
        title: t('common.error'),
        description: t('media.quick.failed'),
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
          <DialogTitle>{t('media.quick.title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (event.dataTransfer.files?.length) processFiles(Array.from(event.dataTransfer.files));
            }}
            className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
          >
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              multiple
              accept="image/*,.heic,.heif,video/mp4,video/quicktime,video/webm,video/x-msvideo,video/x-matroska"
              onChange={(event) => {
                if (event.target.files?.length) processFiles(Array.from(event.target.files));
                event.target.value = '';
              }}
            />
            <div className="h-12 w-12 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center mb-3">
              <Upload className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{t('media.quick.drop')}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-[240px]">{t('media.quick.hint')}</p>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-gray-200 dark:border-gray-700" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white dark:bg-gray-950 px-2 text-gray-500">{t('media.quick.or')}</span>
            </div>
          </div>

          <Button
            variant="outline"
            className="w-full py-6 h-auto flex flex-col items-center gap-1 border-dashed hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/10"
            onClick={() => setActiveMode('advanced')}
          >
            <Camera className="h-6 w-6" />
            <div className="text-sm font-semibold">{t('media.quick.camera')}</div>
            <div className="text-xs text-gray-500">{t('media.quick.cameraHint')}</div>
          </Button>

          {files.length > 0 && (
            <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
              {files.map((file, idx) => (
                <div key={`${file.name}-${idx}`} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm">
                  <div className="flex items-center gap-2 overflow-hidden">
                    {file.type?.startsWith('video/') ? (
                      <FileVideo className="h-4 w-4 flex-shrink-0 text-blue-500" />
                    ) : (
                      <ImageIcon className="h-4 w-4 flex-shrink-0 text-gray-400" />
                    )}
                    <span className="truncate max-w-[200px]">{file.name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFiles(files.filter((_, i) => i !== idx))}
                    disabled={uploading}
                    className="text-gray-400 hover:text-red-500"
                    aria-label={t('common.delete')}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={uploading}>
              {t('media.quick.cancel')}
            </Button>
            <Button onClick={handleUpload} disabled={files.length === 0 || uploading} className="min-w-[100px]">
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {progress}%
                </>
              ) : (
                t('media.quick.upload')
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default QuickPhotoUpload;
