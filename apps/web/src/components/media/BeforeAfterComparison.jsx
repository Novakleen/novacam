import React, { useState } from 'react';
import { ArrowRightLeft, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { sliderImageWidthPercent } from '@/lib/beforeAfterLayout';
import { cn } from '@/lib/utils';

const BeforeAfterComparison = ({ comparison, onDelete, className }) => {
  const { t } = useTranslation();
  const [sliderPosition, setSliderPosition] = useState(50);

  if (!comparison || !comparison.before_photo || !comparison.after_photo) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
        {t('media.beforeAfter.comparisonError')}
      </div>
    );
  }

  const beforeUrl = comparison.before_photo?.file_url;
  const afterUrl = comparison.after_photo?.file_url;
  if (!beforeUrl || !afterUrl) return null;

  const position = Number(sliderPosition);
  const imageWidth = sliderImageWidthPercent(position);

  return (
    <div className={cn('relative overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800', className)}>
      <div className="flex items-center justify-between border-b border-gray-100 p-3 dark:border-gray-800">
        <span className="truncate pr-2 text-sm font-medium">{comparison.comparison_name}</span>
        {onDelete && (
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-gray-400 hover:text-red-500"
            onClick={() => onDelete(comparison.id)}
            aria-label={t('common.delete')}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="relative aspect-[4/3] w-full select-none overflow-hidden">
        <div className="absolute inset-0">
          <img src={afterUrl} alt={t('media.beforeAfter.after')} className="h-full w-full object-cover" />
          <div className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">
            {t('media.beforeAfter.after')}
          </div>
        </div>

        <div className="absolute inset-y-0 left-0 overflow-hidden border-r-2 border-white" style={{ width: `${position}%` }}>
          {imageWidth != null && (
            <img
              src={beforeUrl}
              alt={t('media.beforeAfter.before')}
              className="h-full max-w-none object-cover"
              style={{ width: `${imageWidth}%` }}
            />
          )}
          <div className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">
            {t('media.beforeAfter.before')}
          </div>
        </div>

        <div className="absolute inset-y-0 flex w-8 -translate-x-1/2 items-center justify-center" style={{ left: `${position}%` }}>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-md">
            <ArrowRightLeft className="h-3.5 w-3.5 text-gray-600" />
          </div>
        </div>

        <input
          type="range"
          min="0"
          max="100"
          value={position}
          onChange={(event) => setSliderPosition(Number(event.target.value))}
          className="absolute inset-0 z-10 h-full w-full cursor-ew-resize opacity-0"
          aria-label={t('media.beforeAfter.templates.slider')}
        />
      </div>
    </div>
  );
};

export default BeforeAfterComparison;
