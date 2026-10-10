import React, { useRef } from 'react';
import { X, Camera, Image as ImageIcon, Images } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useTranslation } from 'react-i18next';

const PhotoCaptureDialog = ({
  open,
  onClose,
  onFiles,
  onReview,
  photoCount,
  description,
  onDescriptionChange,
  tags,
  onTagsChange,
}) => {
  const { t } = useTranslation();
  const cameraRef = useRef(null);
  const libraryRef = useRef(null);

  if (!open) return null;

  const handleChange = (fromCamera) => (event) => {
    const files = event.target.files;
    if (files && files.length > 0) onFiles(files, { fromCamera });
    event.target.value = '';
  };

  return (
    <div className="fixed inset-0 z-50 bg-black text-white flex flex-col">
      <div className="flex items-center justify-between p-4">
        <div>
          <p className="text-sm font-medium">{t('media.capture.sessionTitle')}</p>
          <p className="text-xs text-white/70">{t('media.capture.capturedCount', { count: photoCount })}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="text-white hover:bg-white/20 rounded-full" aria-label={t('media.viewerClose')}>
          <X className="h-6 w-6" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          className="w-full rounded-2xl border border-white/15 bg-white/5 py-10 flex flex-col items-center gap-3 active:scale-[0.99]"
        >
          <span className="h-20 w-20 rounded-full border-4 border-white flex items-center justify-center">
            <Camera className="h-8 w-8" />
          </span>
          <span className="text-lg font-semibold">{t('media.capture.takePhoto')}</span>
        </button>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*,.heic,.heif"
          capture="environment"
          multiple
          className="hidden"
          onChange={handleChange(true)}
        />

        <Button
          type="button"
          variant="outline"
          className="w-full h-12 bg-transparent text-white border-white/30 hover:bg-white/10"
          onClick={() => libraryRef.current?.click()}
        >
          <ImageIcon className="mr-2 h-4 w-4" />
          {t('media.capture.fromLibrary')}
        </Button>
        <input
          ref={libraryRef}
          type="file"
          accept="image/*,.heic,.heif"
          multiple
          className="hidden"
          onChange={handleChange(false)}
        />

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="capture-description">{t('media.capture.description')}</label>
          <Textarea
            id="capture-description"
            value={description}
            onChange={(event) => onDescriptionChange(event.target.value.slice(0, 500))}
            placeholder={t('media.capture.descriptionPlaceholder')}
            className="min-h-[88px] bg-white/10 border-white/20 text-white placeholder:text-white/40"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="capture-tags">{t('media.capture.tags')}</label>
          <Input
            id="capture-tags"
            value={tags}
            onChange={(event) => onTagsChange(event.target.value)}
            placeholder={t('media.capture.tagsPlaceholder')}
            className="bg-white/10 border-white/20 text-white placeholder:text-white/40"
          />
          <p className="text-xs text-white/60">{t('media.capture.tagsHint')}</p>
        </div>
      </div>

      <div className="p-4 border-t border-white/10">
        <Button
          type="button"
          className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white"
          disabled={photoCount === 0}
          onClick={onReview}
        >
          <Images className="mr-2 h-4 w-4" />
          {t('media.capture.review')}
        </Button>
      </div>
    </div>
  );
};

export default PhotoCaptureDialog;
