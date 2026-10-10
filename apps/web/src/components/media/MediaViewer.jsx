import React, { useEffect, useMemo, useRef, useState } from 'react';
import Lightbox from 'yet-another-react-lightbox';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import 'yet-another-react-lightbox/styles.css';
import { ChevronDown, Download, MapPin, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IMAGE_LIMITS, computeLongEdgeSize, extensionFromUrl } from '@/lib/imageSizes';
import { formatCaptureDateTimeShort } from '@/lib/mediaDates';

const VIEWER_CSS = `
.novacam-viewer {
  --novacam-toolbar-h: 64px;
  --novacam-info-h: 240px;
}
.novacam-viewer .yarl__container {
  align-items: flex-start;
}
.novacam-viewer .yarl__toolbar {
  left: 0;
  width: 100%;
  height: var(--novacam-toolbar-h);
  background: #000;
  z-index: 3;
}
.novacam-viewer .yarl__carousel {
  height: calc(100% - var(--novacam-toolbar-h) - var(--novacam-info-h));
  margin-top: var(--novacam-toolbar-h);
}
.novacam-viewer .novacam-info {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  max-height: 46%;
  overflow: auto;
  background: #0b0b0b;
  z-index: 3;
}
@media (max-width: 767px) {
  .novacam-viewer .yarl__navigation_prev,
  .novacam-viewer .yarl__navigation_next {
    display: none;
  }
}
`;

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

const InfoRow = ({ label, children }) => (
  <div className="min-w-0">
    <dt className="text-[11px] uppercase tracking-wide text-white/50">{label}</dt>
    <dd className="mt-0.5 text-sm text-white">{children}</dd>
  </div>
);

const InfoPanel = ({ slide, language, open, onToggle }) => {
  const { t } = useTranslation();
  const item = slide?.media;
  if (!item) return null;
  const author = item.uploaded_by_profile?.full_name || item.uploaded_by_profile?.initials || '';
  const when = formatCaptureDateTimeShort(item, language);
  const latitude = Number(item.latitude);
  const longitude = Number(item.longitude);
  const hasGps =
    item.latitude != null &&
    item.longitude != null &&
    item.latitude !== '' &&
    item.longitude !== '' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude);
  const maps = hasGps
    ? `https://www.google.com/maps?q=${latitude},${longitude}`
    : null;

  return (
    <div
      className="novacam-info pointer-events-auto text-white"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      data-testid="media-info"
    >
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm text-white/80"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span>{open ? t('media.viewerInfoHide') : t('media.viewerInfoShow')}</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <dl className="space-y-3 px-4 pb-4">
          <InfoRow label={t('media.viewerAuthor')}>{author || '—'}</InfoRow>
          <InfoRow label={t('media.viewerCaptured')}>
            <span className="whitespace-nowrap">{when || '—'}</span>
          </InfoRow>
          {maps && (
            <InfoRow label={t('media.viewerPlace')}>
              <a
                href={maps}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 underline underline-offset-2"
              >
                <MapPin className="h-4 w-4 shrink-0" />
                {t('media.viewerGps')}
              </a>
            </InfoRow>
          )}
          <InfoRow label={t('media.viewerDescription')}>
            <span className="whitespace-pre-wrap">{item.description || t('media.viewerNoDescription')}</span>
          </InfoRow>
        </dl>
      )}
    </div>
  );
};

const MediaViewer = ({ media, allMedia, onClose, onDelete }) => {
  const { t, i18n } = useTranslation();
  const language = (i18n.resolvedLanguage || i18n.language || 'fr').slice(0, 2);
  const slides = useMemo(() => (allMedia || []).map(slideFor), [allMedia]);
  const startIndex = Math.max(0, (allMedia || []).findIndex((item) => item.id === media.id));
  const [index, setIndex] = useState(startIndex);
  const [infoOpen, setInfoOpen] = useState(true);
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

  useEffect(() => {
    const root = document.querySelector('.novacam-viewer');
    const info = document.querySelector('[data-testid="media-info"]');
    if (!root || !info) return undefined;
    const apply = () => {
      root.style.setProperty('--novacam-info-h', `${info.offsetHeight}px`);
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(info);
    return () => observer.disconnect();
  }, [infoOpen, index]);

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
    <>
    <style>{VIEWER_CSS}</style>
    <Lightbox
      open
      className="novacam-viewer"
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
        controls: () => (
          <InfoPanel
            slide={slides[index]}
            language={language}
            open={infoOpen}
            onToggle={() => setInfoOpen((value) => !value)}
          />
        ),
      }}
    />
    </>
  );
};

export default MediaViewer;
