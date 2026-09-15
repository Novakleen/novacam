import React, { useState } from 'react';
import { usePhotoCapture } from '@/hooks/usePhotoCapture';
import PhotoCaptureDialog from './PhotoCaptureDialog';
import PhotoAnnotationCanvas from './PhotoAnnotationCanvas';
import PhotoDescriptionForm from './PhotoDescriptionForm';
import PhotoReviewGallery from './PhotoReviewGallery';
import VideoUploadFlow from '@/components/media/VideoUploadFlow';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { compressImage } from '@/lib/mediaUtils';
import { Dialog, DialogContent } from '@/components/ui/dialog';

// Helper to convert dataURL to Blob
const dataURLtoBlob = (dataurl) => {
    const arr = dataurl.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
};

const AdvancedPhotoUploadDialog = ({ 
  open, 
  onClose, 
  projectId, 
  onSuccess,
  initialFiles = [], // New prop for files passed from QuickUpload
  defaultMode = 'photo' // 'photo' | 'video'
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [uploadMode, setUploadMode] = useState(defaultMode); // 'photo' or 'video'
  const [videoFile, setVideoFile] = useState(initialFiles.find(f => f.type.startsWith('video/')) || null);

  const {
    photos,
    currentPhoto,
    currentPhotoIndex,
    step,
    addPhoto,
    updatePhotoAnnotation,
    updatePhotoDescription,
    deletePhoto,
    retakePhoto,
    resetCapture,
    goToStep
  } = usePhotoCapture();

  // If initial file is video, switch mode
  React.useEffect(() => {
     const vFile = initialFiles.find(f => f.type.startsWith('video/'));
     if (vFile) {
        setUploadMode('video');
        setVideoFile(vFile);
     }
  }, [initialFiles]);

  const handleCapture = (dataUrl) => {
    // Enforce single photo limit
    if (photos.length >= 1) {
      toast({
        variant: "destructive",
        title: "Limit Reached",
        description: "Only one photo per annotation session."
      });
      return;
    }

    addPhoto(dataUrl);
    setTimeout(() => goToStep('annotate'), 0);
  };

  const handleAnnotationSave = (annotatedDataUrl) => {
    updatePhotoAnnotation(currentPhotoIndex, annotatedDataUrl);
    goToStep('describe');
  };

  const handleDescriptionSave = (description) => {
    updatePhotoDescription(currentPhotoIndex, description);
    goToStep('review');
  };
  
  const handleAddAnother = (description) => {
    updatePhotoDescription(currentPhotoIndex, description);
    goToStep('review');
  }

  const handleUploadAll = async () => {
    if (photos.length === 0) return;
    setUploading(true);
    let successCount = 0;

    try {
      for (const photo of photos) {
        const blob = dataURLtoBlob(photo.annotatedDataUrl);
        const file = new File([blob], `capture-${photo.id}.jpg`, { type: 'image/jpeg' });
        const compressedFile = await compressImage(file, 'HIGH');
        
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
        const filePath = `${projectId}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('project-media')
          .upload(filePath, compressedFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('project-media')
          .getPublicUrl(filePath);

        const { error: dbError } = await supabase
          .from('media')
          .insert({
            project_id: projectId,
            uploaded_by: user.id,
            file_url: publicUrl,
            file_type: 'image',
            thumbnail_url: publicUrl,
            description: photo.description || ''
          });
          
        if (dbError) throw dbError;
        successCount++;
      }

      toast({
        title: "Upload Complete",
        description: `Successfully uploaded ${successCount} photo.`,
      });
      
      resetCapture();
      onSuccess?.();
      onClose();
      
    } catch (err) {
      console.error("Upload error:", err);
      toast({
        variant: "destructive",
        title: "Upload Failed",
        description: "Photo failed to upload."
      });
    } finally {
      setUploading(false);
    }
  };
  
  const handleClose = () => {
    if (uploadMode === 'photo' && photos.length > 0) {
      if (window.confirm("Discard captured photo?")) {
        resetCapture();
        onClose();
      }
    } else {
      onClose();
    }
  };

  if (!open) return null;

  // Video Mode
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

  // Photo Capture Flows
  return (
    <>
      {step === 'capture' && (
        <PhotoCaptureDialog 
          open={true}
          onClose={handleClose}
          onCapture={handleCapture}
          photoCount={photos.length}
          isDisabled={photos.length >= 1}
        />
      )}

      {step === 'annotate' && currentPhoto && (
        <PhotoAnnotationCanvas 
          photoDataUrl={currentPhoto.originalDataUrl}
          onSave={handleAnnotationSave}
          onCancel={() => goToStep('capture')}
        />
      )}

      {step === 'describe' && currentPhoto && (
        <PhotoDescriptionForm 
          photo={currentPhoto}
          index={currentPhotoIndex}
          total={photos.length}
          onSave={handleDescriptionSave}
          onRetake={() => retakePhoto(currentPhotoIndex)}
          onAddAnother={handleAddAnother} 
          allowAddAnother={false} 
        />
      )}

      {step === 'review' && (
        <PhotoReviewGallery 
          photos={photos}
          onDelete={deletePhoto}
          onAddMore={() => goToStep('capture')}
          onUpload={handleUploadAll}
          uploading={uploading}
          allowAddMore={false}
        />
      )}
    </>
  );
};

export default AdvancedPhotoUploadDialog;