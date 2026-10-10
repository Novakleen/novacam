import React, { useMemo, useRef, useState } from 'react';
import Lightbox from 'yet-another-react-lightbox';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import 'yet-another-react-lightbox/styles.css';
import { Download, MapPin, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IMAGE_LIMITS, computeLongEdgeSize, extensionFromUrl } from '@/lib/imageSizes';
import { formatCaptureDateTime } from '@/lib/mediaDates';

function slideFor(item) {
  if (item.file_type === 'video') {
    const poster = item.thumbnail_url && item.thumbnail_url !== item.file_url ? item.thumbnail_url : undefined;
    return { type: 'video', src: item.file_url, poster, media: item };
  }

  const original = item.file_url;
  const web = item.web_url && item.web_url !== original ? item.web_url : original;
  let width;
  let height;
  if (item.width && item.height) {
    const sized = computeLongEdgeSize(
      item.width,
      item.height,
      web === original ? IMAGE_LIMITS.original : IMAGE_LIMITS.web
    );
    width = sized.width;
    height = sized.height;
  }

  return {
    src: web,
    width,
    height,
    alt: item.description || '',
    originalSrc: original,
    media: item,
  };
}

async function downloadItem(item) {
  const fallback = item.file_type === 'video' ? 'mp4' : 'jpg';
  const extension = extensionFromUrl(item.file_url, fallback);
  const response = await fetch(item.file_url);
  if (!response.ok) throw new Error('download failed');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `photo-${item.id}.${extension}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const InfoPanel = ({ slide, language }) => {
  const { t } = useTranslation();
  const item = slide?.media;
  if (!item) return null;
  const author = item.uploaded_by_profile?.full_name || item.uploaded_by_profile?.initials || '';
  const when = formatCaptureDateTime(item, language);
  const hasGps = Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude));
  const maps = hasGps
    ? `https://www.google.com/maps?q=${item.latitude},${item.longitude}`
    : null;

  return (
    <div
      className="pointer-events-auto absolute bottom-3 left-3 right-3 z-20 mx-auto max-w-lg rounded-2xl bg-black/75 text-white backdrop-blur px-4 py-3 text-sm"
      onClick={(event) => event.stopPropagation()}
      data-testid="media-info"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {author && (
            <p className="font-semibold truncate">
              <span className="text-white/60 font-normal">{t('media.viewerAuthor')}: </span>
              {author}
            </p>
          )}
          {when && (
            <p className="text-white/85">
              <span className="text-white/60">{t('media.viewerCaptured')}: </span>
              {when}
            </p>
          )}
        </div>
        {maps && (
          <a
            href={maps}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 inline-flex items-center gap-1 underline underline-offset-2"
          >
            <MapPin className="h-4 w-4" />
            {t('media.viewerGps')}
          </a>
        )}
      </div>
      <p className="mt-2 text-white/90 whitespace-pre-wrap">
        <span className="text-white/60">{t('media.viewerDescription')}: </span>
        {item.description || t('media.viewerNoDescription')}
      </p>
    </div>
  );
};

const MediaViewer = ({ media, allMedia, onClose, onDelete }) => {
  const { t, i18n } = useTranslation();
  const language = (i18n.resolvedLanguage || i18n.language || 'fr').slice(0, 2);
  const slides = useMemo(() => (allMedia || []).map(slideFor), [allMedia]);
  const startIndex = Math.max(0, (allMedia || []).findIndex((item) => item.id === media.id));
  const [index, setIndex] = useState(startIndex);
  const indexRef = useRef(startIndex);
  const slidesRef = useRef(slides);
  slidesRef.current = slides;

  const promoteOriginal = () => {
    const slide = slidesRef.current[indexRef.current];
    if (!slide?.originalSrc || slide.originalSrc === slide.src) return;
    const image = document.querySelector('.yarl__slide_current img');
    if (!image || image.getAttribute('src') === slide.originalSrc) return;
    const preload = new Image();
    preload.onload = () => {
      image.src = slide.originalSrc;
    };
    preload.src = slide.originalSrc;
  };

  const current = allMedia[index] || media;

  const handleDownload = async (event) => {
    event?.stopPropagation();
    try {
      await downloadItem(current);
    } catch (error) {
      console.error(error);
      window.open(current.file_url, '_blank', 'noopener');
    }
  };

  return (
    <Lightbox
      open
      close={onClose}
      index={index}
      slides={slides}
      plugins={[Zoom]}
      carousel={{ finite: true, preload: 2, imageFit: 'contain' }}
      animation={{ swipe: 240 }}
      zoom={{
        maxZoomPixelRatio: 3,
        scrollToZoom: true,
        pinchZoomV4: true,
      }}
      controller={{ closeOnBackdropClick: true }}
      labels={{
        Previous: t('media.viewerPrev'),
        Next: t('media.viewerNext'),
        Close: t('media.viewerClose'),
        'Zoom in': t('media.viewerZoomIn'),
        'Zoom out': t('media.viewerZoomOut'),
      }}
      toolbar={{
        buttons: [
          <button
            key="download"
            type="button"
            className="yarl__button"
            aria-label={t('media.viewerDownload')}
            onClick={handleDownload}
          >
            <Download className="h-6 w-6" />
          </button>,
          onDelete ? (
            <button
              key="delete"
              type="button"
              className="yarl__button"
              aria-label={t('media.viewerDelete')}
              onClick={(event) => {
                event.stopPropagation();
                onDelete(current);
              }}
            >
              <Trash2 className="h-6 w-6" />
            </button>
          ) : null,
          'close',
        ].filter(Boolean),
      }}
      on={{
        view: ({ index: next }) => {
          indexRef.current = next;
          setIndex(next);
        },
        zoom: ({ zoom }) => {
          if (zoom > 1.01) promoteOriginal();
        },
      }}
      render={{
        slide: ({ slide, rect }) => {
          if (slide.type !== 'video') return undefined;
          return (
            <video
              src={slide.src}
              poster={slide.poster}
              controls
              playsInline
              style={{ maxWidth: '100%', maxHeight: rect?.height || '100%' }}
            >
              {t('media.viewerVideoUnsupported')}
            </video>
          );
        },
        slideFooter: ({ slide }) => <InfoPanel slide={slide} language={language} />,
      }}
    />
  );
};

export default MediaViewer;
