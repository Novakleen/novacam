import React from 'react';
import { Trash2, Plus, Upload, PenLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useTranslation } from 'react-i18next';

const PhotoReviewGallery = ({
  photos,
  tags,
  onTagsChange,
  onDescriptionChange,
  onDelete,
  onAddMore,
  onAnnotate,
  onUpload,
  uploading,
}) => {
  const { t } = useTranslation();

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-gray-950 flex flex-col">
      <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center gap-3">
        <div>
          <h2 className="text-xl font-bold">{t('media.capture.sessionTitle')}</h2>
          <p className="text-sm text-gray-500">{t('media.capture.capturedCount', { count: photos.length })}</p>
        </div>
        <Button variant="outline" size="sm" onClick={onAddMore} disabled={uploading}>
          <Plus className="mr-2 h-4 w-4" /> {t('media.capture.addMore')}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="review-tags">{t('media.capture.tags')}</label>
          <Input
            id="review-tags"
            value={tags}
            onChange={(event) => onTagsChange(event.target.value)}
            placeholder={t('media.capture.tagsPlaceholder')}
            disabled={uploading}
          />
          <p className="text-xs text-gray-500">{t('media.capture.tagsHint')}</p>
        </div>

        {photos.map((photo, index) => (
          <div key={photo.id} className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-900">
            <div className="aspect-square bg-gray-100 dark:bg-gray-950 relative">
              <img src={photo.objectUrl} alt="" className="w-full h-full object-cover" />
              <div className="absolute top-2 right-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => onAnnotate(index)}
                  disabled={uploading}
                  className="bg-black/60 text-white p-2 rounded-full"
                  aria-label={t('media.capture.annotate')}
                >
                  <PenLine className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(index)}
                  disabled={uploading}
                  className="bg-black/60 hover:bg-red-600 text-white p-2 rounded-full"
                  aria-label={t('media.viewerDelete')}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="p-3">
              <Textarea
                value={photo.description || ''}
                onChange={(event) => onDescriptionChange(index, event.target.value.slice(0, 500))}
                placeholder={t('media.capture.descriptionPlaceholder')}
                className="min-h-[72px]"
                disabled={uploading}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="p-4 border-t border-gray-100 dark:border-gray-800">
        <Button
          onClick={onUpload}
          disabled={uploading || photos.length === 0}
          className="w-full h-12 text-base bg-green-600 hover:bg-green-700 text-white"
        >
          {uploading ? t('media.capture.uploading') : (
            <>
              {t('media.capture.confirmUpload', { count: photos.length })} <Upload className="ml-2 h-5 w-5" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

export default PhotoReviewGallery;
