import React, { useState } from 'react';
import { Camera, Image as ImageIcon, RotateCcw, X, AlertCircle } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useBeforeAfterState } from '@/hooks/useBeforeAfterState';
import BeforeAfterCaptureMode from './BeforeAfterCaptureMode';
import BeforeAfterGalleryMode from './BeforeAfterGalleryMode';
import BeforeAfterPreview from './BeforeAfterPreview';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';

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

const BeforeAfterEditor = ({ open, onClose, projectId, projectMedia, onSuccess }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  const {
    beforePhoto,
    afterPhoto,
    editorMode,
    activeSlot,
    setBeforePhoto,
    setAfterPhoto,
    setEditorMode,
    setActiveSlot,
    resetPhotos,
    getValidationErrors
  } = useBeforeAfterState();

  const handleStartSelection = (slot, mode) => {
    setActiveSlot(slot);
    setEditorMode(mode); // 'capture' or 'gallery'
  };

  const handleCapture = (dataUrl) => {
    const photoObj = { 
        id: `temp-${Date.now()}`, 
        dataUrl, 
        isTemp: true 
    };

    if (activeSlot === 'before') {
      setBeforePhoto(photoObj);
    } else {
      setAfterPhoto(photoObj);
    }
    setEditorMode('initial');
  };

  const handleGallerySelect = (media) => {
    if (activeSlot === 'before') {
      setBeforePhoto(media);
    } else {
      setAfterPhoto(media);
    }
    setEditorMode('initial');
  };

  const handleUploadTempPhoto = async (photoObj) => {
     if (!photoObj.isTemp) return photoObj.id; // Already uploaded

     const blob = dataURLtoBlob(photoObj.dataUrl);
     const fileName = `${projectId}/${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;

     const { error: uploadError } = await supabase.storage
        .from('project-media')
        .upload(fileName, blob);
     
     if (uploadError) throw uploadError;

     const { data: { publicUrl } } = supabase.storage
        .from('project-media')
        .getPublicUrl(fileName);

     // Insert into media table
     const { data: mediaData, error: dbError } = await supabase
        .from('media')
        .insert({
           project_id: projectId,
           uploaded_by: user.id,
           file_url: publicUrl,
           file_type: 'image',
           thumbnail_url: publicUrl,
           description: 'Captured for Before/After'
        })
        .select()
        .single();

     if (dbError) throw dbError;
     return mediaData.id;
  };

  const handleSaveComparison = async ({ name }) => {
     const errors = getValidationErrors();
     if (errors.length > 0) {
        toast({
           variant: "destructive",
           title: "Missing Photos",
           description: "Please select both a Before and After photo."
        });
        return;
     }

     setIsSaving(true);
     try {
        // 1. Ensure both photos are uploaded (if captured)
        const beforeId = await handleUploadTempPhoto(beforePhoto);
        const afterId = await handleUploadTempPhoto(afterPhoto);

        // 2. Create comparison record
        const { error } = await supabase
           .from('before_after_comparisons')
           .insert({
              project_id: projectId,
              before_photo_id: beforeId,
              after_photo_id: afterId,
              comparison_name: name
           });

        if (error) throw error;

        toast({
           title: "Success",
           description: "Comparison saved successfully!"
        });
        onSuccess?.();
        onClose();
        resetPhotos();

     } catch (err) {
        console.error("Save failed:", err);
        toast({
           variant: "destructive",
           title: "Save Failed",
           description: "Could not save the comparison. Please try again."
        });
     } finally {
        setIsSaving(false);
     }
  };

  const handleClose = () => {
     if (beforePhoto || afterPhoto) {
        if (window.confirm("Discard changes?")) {
           resetPhotos();
           onClose();
        }
     } else {
        onClose();
     }
  };

  const renderSlot = (type, photo) => {
    const isFilled = !!photo;
    const label = type === 'before' ? 'Before' : 'After';

    return (
       <div className={`
          flex-1 flex flex-col relative rounded-xl border-2 transition-all overflow-hidden h-64 md:h-80
          ${isFilled ? 'border-transparent' : 'border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900'}
       `}>
          {isFilled ? (
             <>
               <img 
                 src={photo.file_url || photo.dataUrl} 
                 alt={label} 
                 className="w-full h-full object-cover" 
               />
               <div className="absolute top-2 left-2 bg-black/60 text-white text-xs font-bold px-2 py-1 rounded">
                 {label.toUpperCase()}
               </div>
               <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <Button variant="secondary" size="sm" onClick={() => {
                     if (type === 'before') setBeforePhoto(null);
                     else setAfterPhoto(null);
                  }}>
                     Change
                  </Button>
               </div>
             </>
          ) : (
             <div className="flex flex-col items-center justify-center h-full gap-4 p-4 text-center">
                <span className="text-lg font-medium text-gray-500">{label} Photo</span>
                <div className="flex flex-col sm:flex-row gap-2 w-full max-w-[240px]">
                   <Button 
                     variant="outline" 
                     className="flex-1" 
                     onClick={() => handleStartSelection(type, 'gallery')}
                   >
                      <ImageIcon className="w-4 h-4 mr-2" /> Gallery
                   </Button>
                   <Button 
                     className="flex-1 bg-blue-600 hover:bg-blue-700 text-white" 
                     onClick={() => handleStartSelection(type, 'capture')}
                   >
                      <Camera className="w-4 h-4 mr-2" /> Camera
                   </Button>
                </div>
             </div>
          )}
       </div>
    );
  };

  if (!open) return null;

  // Render specific mode based on state
  if (editorMode === 'capture') {
     return (
        <BeforeAfterCaptureMode 
           overlayImage={activeSlot === 'after' ? beforePhoto : null}
           onCapture={handleCapture}
           onClose={() => setEditorMode('initial')}
        />
     );
  }

  if (editorMode === 'gallery') {
     return (
        <Dialog open={true} onOpenChange={() => setEditorMode('initial')}>
           <DialogContent className="max-w-4xl w-full max-h-[90vh] p-0 overflow-hidden flex flex-col">
              <BeforeAfterGalleryMode 
                 projectMedia={projectMedia}
                 onSelect={handleGallerySelect}
                 selectedId={activeSlot === 'before' ? beforePhoto?.id : afterPhoto?.id}
                 onCancel={() => setEditorMode('initial')}
                 title={`Select ${activeSlot === 'before' ? 'Before' : 'After'} Photo`}
              />
           </DialogContent>
        </Dialog>
     );
  }

  if (editorMode === 'preview') {
      return (
         <Dialog open={true} onOpenChange={() => setEditorMode('initial')}>
            <DialogContent className="max-w-4xl w-full max-h-[95vh] h-[90vh] p-0 overflow-hidden flex flex-col">
               <BeforeAfterPreview 
                  beforePhoto={beforePhoto}
                  afterPhoto={afterPhoto}
                  onSave={handleSaveComparison}
                  onCancel={() => setEditorMode('initial')}
                  isSaving={isSaving}
               />
            </DialogContent>
         </Dialog>
      );
  }

  // Initial Split View
  return (
    <Dialog open={true} onOpenChange={handleClose}>
      <DialogContent className="max-w-5xl w-full p-0 gap-0 overflow-hidden bg-white dark:bg-gray-950 md:rounded-2xl max-h-[100dvh] md:max-h-[90vh] h-full md:h-auto flex flex-col">
         <div className="flex-none p-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-white dark:bg-gray-950">
            <div>
               <h2 className="text-xl font-bold">Create Comparison</h2>
               <p className="text-sm text-gray-500">Select photos to compare</p>
            </div>
            <div className="flex items-center gap-2">
               {(beforePhoto || afterPhoto) && (
                  <Button variant="ghost" size="sm" onClick={() => {
                     if(window.confirm('Reset all selections?')) resetPhotos();
                  }} className="text-red-500 hover:bg-red-50">
                     <RotateCcw className="w-4 h-4 mr-2" /> Reset
                  </Button>
               )}
               <Button variant="ghost" size="icon" onClick={handleClose}>
                  <X className="w-5 h-5" />
               </Button>
            </div>
         </div>

         <div className="flex-1 overflow-y-auto p-4 md:p-8 flex flex-col gap-6">
            <div className="flex flex-col md:flex-row gap-4 h-full md:h-auto">
               {renderSlot('before', beforePhoto)}
               {renderSlot('after', afterPhoto)}
            </div>
            
            <div className="flex justify-center pt-4 mt-auto md:mt-0">
               <Button 
                  size="lg" 
                  className="w-full md:w-64 h-12 text-lg font-medium shadow-xl"
                  disabled={!beforePhoto || !afterPhoto}
                  onClick={() => setEditorMode('preview')}
               >
                  Preview & Save
               </Button>
            </div>
         </div>
      </DialogContent>
    </Dialog>
  );
};

export default BeforeAfterEditor;