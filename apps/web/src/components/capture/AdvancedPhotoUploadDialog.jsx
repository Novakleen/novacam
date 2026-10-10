import React, { useState, useEffect } from 'react';
import { usePhotoCapture } from '@/hooks/usePhotoCapture';
import PhotoCaptureDialog from './PhotoCaptureDialog';
import AnnotationEditor from './AnnotationEditor';
import { savePhotoAnnotations } from '@/lib/saveAnnotations';
import PhotoReviewGallery from './PhotoReviewGallery';
import VideoUploadFlow from '@/components/media/VideoUploadFlow';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { uploadProjectImage, parseTagNames } from '@/lib/uploadProjectImage';
import { readCaptureMetadata } from '@/lib/processImage';
import { isImageFile } from '@/lib/imageSizes';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useTranslation } from 'react-i18next';

const AdvancedPhotoUploadDialog = ({
  open,
  onClose,
  projectId,
  onSuccess,
  initialFiles = [],
  defaultMode = 'photo',
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);
  const [annotateSrc, setAnnotateSrc] = useState(null);
  const [uploadMode, setUploadMode] = useState(defaultMode);
  const [videoFile, setVideoFile] = useState(initialFiles.find((file) => file.type?.startsWith('video/')) || null);

  const {
    photos,
    currentPhoto,
    currentPhotoIndex,
    step,
    stickyDescription,
    stickyTags,
    setStickyDescription,
    setStickyTags,
    addFiles,
    updatePhotoAnnotation,
    updatePhotoDescription,
    deletePhoto,
    resetCapture,
    goToStep,
    setCurrentPhotoIndex,
  } = usePhotoCapture();

  useEffect(() => {
    const found = initialFiles.find((file) => file.type?.startsWith('video/'));
    if (found) {
      setUploadMode('video');
      setVideoFile(found);
    }
  }, [initialFiles]);

  const handleFiles = (fileList, { fromCamera }) => {
    const incoming = [...fileList];
    const images = incoming.filter((file) => isImageFile(file));
    if (images.length !== incoming.length) {
      toast({ variant: 'destructive', title: t('common.error'), description: t('media.capture.unsupported') });
    }
    if (images.length === 0) return;
    addFiles(images, { fromCamera });
  };

  useEffect(() => {
    if (step !== 'annotate' || !currentPhoto?.file) {
      setAnnotateSrc(null);
      return undefined;
    }
    const url = URL.createObjectURL(currentPhoto.file);
    setAnnotateSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [step, currentPhoto]);

  const handleAnnotationSave = (payload) => {
    updatePhotoAnnotation(currentPhotoIndex, payload);
    goToStep('review');
  };

  const handleUploadAll = async () => {
    if (photos.length === 0 || !user) return;
    setUploading(true);
    let successCount = 0;
    const tagNames = parseTagNames(stickyTags);

    try {
      for (const photo of photos) {
        const prior = photo.annotatedFile ? await readCaptureMetadata(photo.file) : {};
        const row = await uploadProjectImage(photo.file, {
          projectId,
          userId: user.id,
          description: photo.description || stickyDescription,
          tagNames,
          requestGeolocation: Boolean(photo.fromCamera),
          capturedAt: prior.captured_at || photo.timestamp,
          latitude: prior.latitude,
          longitude: prior.longitude,
        });
        if (photo.annotations && photo.annotatedFile) {
          await savePhotoAnnotations({
            media: row,
            document: photo.annotations,
            flattenedFile: photo.annotatedFile,
          });
        }
        successCount += 1;
      }

      toast({
        title: t('common.success'),
        description: t('media.capture.uploadDone', { count: successCount }),
      });
      resetCapture();
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('Upload error:', err);
      toast({
        variant: 'destructive',
        title: t('common.error'),
        description: t('media.capture.uploadFailed'),
      });
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    if (uploadMode === 'photo' && photos.length > 0) {
      if (window.confirm(t('media.capture.discardConfirm'))) {
        resetCapture();
        onClose();
      }
      return;
    }
    onClose();
  };

  if (!open) return null;

  if (uploadMode === 'video' && videoFile) {
    return (
      <Dialog open={true} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md p-0">
          <VideoUploadFlow
            file={videoFile}
            projectId={projectId}
            userId={user?.id}
            onCancel={handleClose}
            onSuccess={() => {
              onSuccess?.();
              onClose();
            }}
          />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <>
      {step === 'capture' && (
        <PhotoCaptureDialog
          open={true}
          onClose={handleClose}
          onFiles={handleFiles}
          onReview={() => goToStep('review')}
          photoCount={photos.length}
          description={stickyDescription}
          onDescriptionChange={setStickyDescription}
          tags={stickyTags}
          onTagsChange={setStickyTags}
        />
      )}

      {step === 'annotate' && currentPhoto && annotateSrc && (
        <AnnotationEditor
          imageSrc={annotateSrc}
          initialDocument={currentPhoto.annotations}
          onSave={handleAnnotationSave}
          onCancel={() => goToStep('review')}
        />
      )}

      {step === 'review' && (
        <PhotoReviewGallery
          photos={photos}
          tags={stickyTags}
          onTagsChange={setStickyTags}
          onDescriptionChange={updatePhotoDescription}
          onDelete={deletePhoto}
          onAddMore={() => goToStep('capture')}
          onAnnotate={(index) => {
            setCurrentPhotoIndex(index);
            goToStep('annotate');
          }}
          onUpload={handleUploadAll}
          uploading={uploading}
        />
      )}
    </>
  );
};

export default AdvancedPhotoUploadDialog;
