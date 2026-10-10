import React, { useState } from 'react';
import { Camera, Image as ImageIcon, RotateCcw, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { dataUrlToFile } from '@/lib/dataUrl';
import { uploadProjectImage } from '@/lib/uploadProjectImage';
import { useBeforeAfterState } from '@/hooks/useBeforeAfterState';
import BeforeAfterCaptureMode from './BeforeAfterCaptureMode';
import BeforeAfterGalleryMode from './BeforeAfterGalleryMode';
import BeforeAfterComposer from './BeforeAfterComposer';

const BeforeAfterEditor = ({
  open,
  onClose,
  projectId,
  projectName,
  projectMedia,
  onSuccess,
  initialBefore = null,
  initialAfter = null,
  initialMode = null,
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [isSaving, setIsSaving] = useState(false);
  const seedMode = initialMode || (initialBefore && initialAfter ? 'compose' : 'initial');

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
    getValidationErrors,
  } = useBeforeAfterState({
    before: initialBefore,
    after: initialAfter,
    mode: seedMode,
    slot: seedMode === 'capture' || seedMode === 'gallery' ? 'after' : null,
  });

  const images = (projectMedia || []).filter((item) => item.file_type !== 'video');

  const handleStartSelection = (slot, mode) => {
    setActiveSlot(slot);
    setEditorMode(mode);
  };

  const returnAfterPick = (slot, photo) => {
    const other = slot === 'before' ? afterPhoto : beforePhoto;
    if (slot === 'before') setBeforePhoto(photo);
    else setAfterPhoto(photo);
    setEditorMode(other ? 'compose' : 'initial');
  };

  const handleCapture = (dataUrl) => {
    returnAfterPick(activeSlot || 'after', {
      id: `temp-${Date.now()}`,
      dataUrl,
      isTemp: true,
      captured_at: new Date().toISOString(),
    });
  };

  const handleUploadTempPhoto = async (photoObj) => {
    if (!photoObj?.isTemp) return photoObj.id;
    const file = dataUrlToFile(photoObj.dataUrl, `before-after-${Date.now()}.jpg`);
    const mediaData = await uploadProjectImage(file, {
      projectId,
      userId: user.id,
      description: t('media.beforeAfterCaptured'),
      requestGeolocation: true,
      capturedAt: photoObj.captured_at || new Date().toISOString(),
    });
    return mediaData.id;
  };

  const handleSave = async ({ name, template, file, layout }) => {
    const errors = getValidationErrors();
    if (errors.length > 0 || !user) {
      toast({ variant: 'destructive', title: t('common.error'), description: t('media.beforeAfter.missing') });
      return;
    }
    setIsSaving(true);
    try {
      const beforeId = await handleUploadTempPhoto(beforePhoto);
      const afterId = await handleUploadTempPhoto(afterPhoto);
      const exported = await uploadProjectImage(file, {
        projectId,
        userId: user.id,
        description: name,
        kind: 'before_after',
        capturedAt: new Date().toISOString(),
      });
      const { error } = await supabase.from('before_after_comparisons').insert({
        project_id: projectId,
        before_photo_id: beforeId,
        after_photo_id: afterId,
        comparison_name: name,
        template,
        export_media_id: exported.id,
        layout,
      });
      if (error) throw error;
      toast({ title: t('common.success'), description: t('media.beforeAfter.saved') });
      onSuccess?.();
      resetPhotos();
      onClose?.();
    } catch (err) {
      console.error(err);
      toast({ variant: 'destructive', title: t('common.error'), description: t('media.beforeAfter.saveFailed') });
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    if ((beforePhoto || afterPhoto) && !window.confirm(t('media.beforeAfter.discard'))) return;
    resetPhotos();
    onClose?.();
  };

  const renderSlot = (type, photo) => {
    const label = type === 'before' ? t('media.beforeAfter.before') : t('media.beforeAfter.after');
    return (
      <div
        className={`relative flex h-64 flex-1 flex-col overflow-hidden rounded-xl border-2 md:h-80 ${
          photo ? 'border-transparent' : 'border-dashed border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-900'
        }`}
      >
        {photo ? (
          <>
            <img src={photo.file_url || photo.dataUrl} alt={label} className="h-full w-full object-cover" />
            <div className="absolute left-2 top-2 rounded bg-black/70 px-2 py-1 text-xs font-bold text-white">{label}</div>
            <div className="absolute inset-x-0 bottom-0 flex gap-2 bg-gradient-to-t from-black/80 to-transparent p-3">
              <Button
                variant="secondary"
                className="h-11 flex-1"
                onClick={() => handleStartSelection(type, 'gallery')}
              >
                {t('media.beforeAfter.change')}
              </Button>
              <Button variant="secondary" className="h-11" onClick={() => handleStartSelection(type, 'capture')}>
                <Camera className="h-4 w-4" />
              </Button>
              <Button
                variant="secondary"
                className="h-11"
                onClick={() => (type === 'before' ? setBeforePhoto(null) : setAfterPhoto(null))}
                aria-label={t('common.delete')}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-4 text-center">
            <span className="text-lg font-medium text-gray-500">{t(type === 'before' ? 'media.beforeAfter.beforePhoto' : 'media.beforeAfter.afterPhoto')}</span>
            <div className="flex w-full max-w-[260px] flex-col gap-2 sm:flex-row">
              <Button variant="outline" className="h-11 flex-1" onClick={() => handleStartSelection(type, 'gallery')}>
                <ImageIcon className="mr-2 h-4 w-4" /> {t('media.beforeAfter.gallery')}
              </Button>
              <Button className="h-11 flex-1 bg-[#0b1f4d] text-[#facc15] hover:bg-black" onClick={() => handleStartSelection(type, 'capture')}>
                <Camera className="mr-2 h-4 w-4" /> {t('media.beforeAfter.camera')}
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (!open) return null;

  if (editorMode === 'capture') {
    return (
      <BeforeAfterCaptureMode
        overlayImage={activeSlot === 'after' ? beforePhoto : null}
        onCapture={handleCapture}
        onClose={() => setEditorMode(beforePhoto && afterPhoto ? 'compose' : 'initial')}
      />
    );
  }

  if (editorMode === 'gallery') {
    const sideLabel = activeSlot === 'before' ? t('media.beforeAfter.before') : t('media.beforeAfter.after');
    return (
      <Dialog open onOpenChange={() => setEditorMode(beforePhoto && afterPhoto ? 'compose' : 'initial')}>
        <DialogContent className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden p-0">
          <BeforeAfterGalleryMode
            projectMedia={images}
            onSelect={(media) => returnAfterPick(activeSlot || 'after', media)}
            selectedId={activeSlot === 'before' ? beforePhoto?.id : afterPhoto?.id}
            onCancel={() => setEditorMode(beforePhoto && afterPhoto ? 'compose' : 'initial')}
            title={t('media.beforeAfter.selectTitle', { side: sideLabel })}
          />
        </DialogContent>
      </Dialog>
    );
  }

  if (editorMode === 'compose' && beforePhoto && afterPhoto) {
    return (
      <BeforeAfterComposer
        beforePhoto={beforePhoto}
        afterPhoto={afterPhoto}
        projectName={projectName}
        initialTemplate="side-by-side"
        isSaving={isSaving}
        onBack={() => setEditorMode('initial')}
        onSwap={() => {
          const previousBefore = beforePhoto;
          setBeforePhoto(afterPhoto);
          setAfterPhoto(previousBefore);
        }}
        onChangeSide={(side) => handleStartSelection(side, 'gallery')}
        onSave={handleSave}
      />
    );
  }

  return (
    <Dialog open onOpenChange={handleClose}>
      <DialogContent className="flex h-full max-h-[100dvh] w-full max-w-5xl flex-col gap-0 overflow-hidden bg-white p-0 dark:bg-gray-950 md:h-auto md:max-h-[90vh] md:rounded-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 p-4 dark:border-gray-800">
          <div>
            <h2 className="text-xl font-bold">{t('media.beforeAfter.create')}</h2>
            <p className="text-sm text-gray-500">{t('media.beforeAfter.createHint')}</p>
          </div>
          <div className="flex items-center gap-2">
            {(beforePhoto || afterPhoto) && (
              <Button
                variant="ghost"
                size="sm"
                className="text-red-500"
                onClick={() => {
                  if (window.confirm(t('media.beforeAfter.resetConfirm'))) resetPhotos();
                }}
              >
                <RotateCcw className="mr-2 h-4 w-4" /> {t('media.beforeAfter.reset')}
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={handleClose} aria-label={t('common.cancel')}>
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-4 md:p-8">
          <div className="flex h-full flex-col gap-4 md:h-auto md:flex-row">
            {renderSlot('before', beforePhoto)}
            {renderSlot('after', afterPhoto)}
          </div>
          <div className="mt-auto flex justify-center pt-4 md:mt-0">
            <Button
              size="lg"
              className="h-12 w-full bg-[#facc15] text-lg font-semibold text-black hover:bg-[#eab308] md:w-64"
              disabled={!beforePhoto || !afterPhoto}
              onClick={() => setEditorMode('compose')}
            >
              {t('media.beforeAfter.previewSave')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BeforeAfterEditor;
