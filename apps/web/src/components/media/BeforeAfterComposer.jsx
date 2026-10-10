import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowLeftRight, Image as ImageIcon, RotateCw, Share2, ZoomIn, ZoomOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import {
  TEMPLATES,
  clampTransform,
  defaultTransform,
  exportCanvasSize,
  labelsFor,
  nextLogoCorner,
} from '@/lib/beforeAfterLayout';
import {
  comparisonStripText,
  exportComparisonJpeg,
  loadHtmlImage,
  paintComparison,
} from '@/lib/beforeAfterRender';
import { WORDMARK_SRC, fetchCompanyLogoUrl } from '@/lib/companyBranding';
import { shareOrDownloadFile } from '@/lib/shareFile';
import { cn } from '@/lib/utils';

const photoSrc = (photo) => photo?.file_url || photo?.web_url || photo?.dataUrl || photo?.annotated_url || '';

function TemplateGlyph({ id }) {
  if (id === 'stacked') {
    return (
      <div className="flex h-full w-full flex-col">
        <div className="flex-1 bg-zinc-400" />
        <div className="flex-1 bg-zinc-200" />
      </div>
    );
  }
  if (id === 'diagonal') {
    return (
      <div className="relative h-full w-full bg-zinc-200">
        <div className="absolute inset-0 bg-zinc-500" style={{ clipPath: 'polygon(0 0, 22% 0, 100% 72%, 0 100%)' }} />
      </div>
    );
  }
  if (id === 'slider') {
    return (
      <div className="relative h-full w-full bg-zinc-200">
        <div className="absolute inset-y-0 left-0 w-1/2 bg-zinc-500" />
        <div className="absolute inset-y-0 left-1/2 w-0.5 bg-white" />
      </div>
    );
  }
  return (
    <div className="flex h-full w-full">
      <div className="flex-1 bg-zinc-500" />
      <div className="flex-1 bg-zinc-200" />
    </div>
  );
}

const BeforeAfterComposer = ({
  beforePhoto,
  afterPhoto,
  projectName,
  onSwap,
  onChangeSide,
  onBack,
  onSave,
  isSaving = false,
  initialTemplate = 'side-by-side',
}) => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const language = (i18n.resolvedLanguage || i18n.language || 'fr').slice(0, 2);
  const frameRef = useRef(null);
  const canvasRef = useRef(null);
  const gestureRef = useRef(null);
  const pointersRef = useRef(new Map());
  const [template, setTemplate] = useState(initialTemplate);
  const [slider, setSlider] = useState(50);
  const [transforms, setTransforms] = useState({ before: defaultTransform(), after: defaultTransform() });
  const [activeSide, setActiveSide] = useState('after');
  const [labelLang, setLabelLang] = useState(language);
  const [logoCorner, setLogoCorner] = useState('top-left');
  const [showDateStrip, setShowDateStrip] = useState(true);
  const [alignMode, setAlignMode] = useState(initialTemplate !== 'slider');
  const [name, setName] = useState('');
  const [beforeImage, setBeforeImage] = useState(null);
  const [afterImage, setAfterImage] = useState(null);
  const [logoImage, setLogoImage] = useState(null);
  const [working, setWorking] = useState(false);

  const labels = labelsFor(labelLang);

  useEffect(() => {
    let cancelled = false;
    const load = async (photo, setter) => {
      const src = photoSrc(photo);
      if (!src) {
        setter(null);
        return;
      }
      try {
        const image = await loadHtmlImage(src);
        if (!cancelled) setter(image);
      } catch {
        if (!cancelled) setter(null);
      }
    };
    load(beforePhoto, setBeforeImage);
    load(afterPhoto, setAfterImage);
    return () => {
      cancelled = true;
    };
  }, [beforePhoto, afterPhoto]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const url = await fetchCompanyLogoUrl();
      try {
        const image = await loadHtmlImage(url);
        if (!cancelled) setLogoImage(image);
      } catch {
        try {
          const fallback = await loadHtmlImage(WORDMARK_SRC);
          if (!cancelled) setLogoImage(fallback);
        } catch {
          if (!cancelled) setLogoImage(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const spec = useCallback(
    (width, height) => ({
      width,
      height,
      template,
      slider,
      transforms,
      labelLang,
      logoCorner,
      showDateStrip,
      beforeImage,
      afterImage,
      logoImage,
      stripText: showDateStrip
        ? comparisonStripText({
            projectName,
            date: afterPhoto?.captured_at || beforePhoto?.captured_at || new Date().toISOString(),
            labelLang,
          })
        : '',
    }),
    [
      template,
      slider,
      transforms,
      labelLang,
      logoCorner,
      showDateStrip,
      beforeImage,
      afterImage,
      logoImage,
      projectName,
      afterPhoto,
      beforePhoto,
    ]
  );

  const redraw = useCallback(() => {
    const frame = frameRef.current;
    const canvas = canvasRef.current;
    if (!frame || !canvas) return;
    const aspect = exportCanvasSize(template);
    const maxW = frame.clientWidth;
    const maxH = frame.clientHeight;
    if (!maxW || !maxH) return;
    const scale = Math.min(maxW / aspect.width, maxH / aspect.height);
    const cssW = Math.max(1, Math.round(aspect.width * scale));
    const cssH = Math.max(1, Math.round(aspect.height * scale));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintComparison(ctx, spec(cssW, cssH));
  }, [spec, template]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => redraw());
    observer.observe(frame);
    return () => observer.disconnect();
  }, [redraw]);

  const patchActive = (recipe) => {
    setTransforms((prev) => {
      const side = activeSide;
      return { ...prev, [side]: clampTransform(recipe(prev[side])) };
    });
  };

  const onPointerDown = (event) => {
    if (template === 'slider' && !alignMode) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointersRef.current.values()];
    const base = { ...transforms[activeSide] };
    if (points.length >= 2) {
      const [a, b] = points;
      gestureRef.current = {
        type: 'pinch',
        dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        angle: Math.atan2(b.y - a.y, b.x - a.x),
        base,
        side: activeSide,
      };
      return;
    }
    gestureRef.current = { type: 'pan', x: event.clientX, y: event.clientY, base, moved: false, side: activeSide };
  };

  const onPointerMove = (event) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const gesture = gestureRef.current;
    if (!gesture) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const points = [...pointersRef.current.values()];
    if (gesture.type === 'pinch' && points.length >= 2) {
      const [a, b] = points;
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      setTransforms((prev) => ({
        ...prev,
        [gesture.side]: clampTransform({
          ...gesture.base,
          scale: gesture.base.scale * (dist / gesture.dist),
          rotation: gesture.base.rotation + ((angle - gesture.angle) * 180) / Math.PI,
        }),
      }));
      return;
    }
    if (gesture.type !== 'pan') return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (Math.hypot(dx, dy) > 6) gesture.moved = true;
    if (!gesture.moved) return;
    setTransforms((prev) => ({
      ...prev,
      [gesture.side]: clampTransform({
        ...gesture.base,
        x: gesture.base.x + dx / rect.width,
        y: gesture.base.y + dy / rect.height,
      }),
    }));
  };

  const onPointerUp = (event) => {
    const gesture = gestureRef.current;
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size === 0) gestureRef.current = null;
    if (!gesture || gesture.type !== 'pan' || gesture.moved) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (template === 'stacked') setActiveSide(y < rect.height / 2 ? 'before' : 'after');
    else setActiveSide(x < rect.width * 0.45 ? 'before' : 'after');
  };

  const runExport = async () => {
    setWorking(true);
    try {
      return await exportComparisonJpeg(spec());
    } finally {
      setWorking(false);
    }
  };

  const handleShare = async () => {
    try {
      const file = await runExport();
      const result = await shareOrDownloadFile(file, { title: name || `${labels.before} / ${labels.after}` });
      toast({
        title: t('common.success'),
        description: result === 'shared' ? t('media.beforeAfter.shared') : t('media.beforeAfter.downloaded'),
      });
    } catch (error) {
      if (error?.name === 'AbortError') return;
      toast({ variant: 'destructive', title: t('common.error'), description: t('media.beforeAfter.saveFailed') });
    }
  };

  const handleSave = async () => {
    try {
      const file = await runExport();
      await onSave?.({
        name: name.trim() || `${labels.before} / ${labels.after}`,
        template,
        file,
        layout: { template, slider, transforms, labelLang, logoCorner, showDateStrip },
      });
    } catch (error) {
      if (error?.name === 'AbortError') return;
      console.error(error);
      toast({ variant: 'destructive', title: t('common.error'), description: t('media.beforeAfter.saveFailed') });
    }
  };

  const busy = working || isSaving;
  const chip = 'h-10 shrink-0 rounded-full px-3 text-sm font-medium';

  return (
    <div
      data-testid="before-after-composer"
      data-template={template}
      className="fixed inset-0 z-[80] flex flex-col bg-[#0b1220] text-white"
    >
      <header className="flex items-center gap-2 px-3 pt-3">
        <Button variant="ghost" size="icon" className="h-11 w-11 text-white" onClick={onBack} aria-label={t('common.cancel')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t('media.beforeAfter.namePlaceholder')}
          className="h-11 flex-1 rounded-lg bg-white/10 px-3 text-sm placeholder:text-white/40"
          aria-label={t('media.beforeAfter.name')}
        />
        <Button variant="ghost" size="icon" className="h-11 w-11 text-white" onClick={handleShare} disabled={busy || !beforeImage || !afterImage} aria-label={t('media.beforeAfter.share')}>
          <Share2 className="h-5 w-5" />
        </Button>
        <Button className="h-11 bg-[#facc15] font-semibold text-black hover:bg-[#eab308]" onClick={handleSave} disabled={busy || !beforeImage || !afterImage}>
          {busy ? t('media.beforeAfter.saving') : t('media.beforeAfter.save')}
        </Button>
      </header>

      <div ref={frameRef} className="relative flex flex-1 min-h-0 items-center justify-center px-3 py-2">
        <canvas
          ref={canvasRef}
          className="touch-none rounded-md shadow-2xl"
          style={{ touchAction: 'none' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        {template === 'slider' && !alignMode && (
          <input
            type="range"
            min="0"
            max="100"
            value={slider}
            aria-label={t('media.beforeAfter.templates.slider')}
            onChange={(event) => setSlider(Number(event.target.value))}
            className="absolute inset-x-6 top-1/2 h-12 -translate-y-1/2 opacity-0"
          />
        )}
      </div>

      <div className="space-y-2 bg-black/40 px-3 pb-4 pt-2">
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            className={cn(chip, 'bg-white/10')}
            onClick={() => {
              setTransforms((prev) => ({ before: prev.after, after: prev.before }));
              onSwap?.();
            }}
          >
            <ArrowLeftRight className="mr-1 inline h-4 w-4" />
            {t('media.beforeAfter.swap')}
          </button>
          <button
            type="button"
            className={cn(chip, activeSide === 'before' ? 'bg-[#facc15] text-black' : 'bg-white/10')}
            onClick={() => setActiveSide('before')}
          >
            {labels.before}
          </button>
          <button
            type="button"
            className={cn(chip, activeSide === 'after' ? 'bg-[#facc15] text-black' : 'bg-white/10')}
            onClick={() => setActiveSide('after')}
          >
            {labels.after}
          </button>
          <button type="button" className={cn(chip, 'bg-white/10')} onClick={() => patchActive((current) => ({ ...current, scale: current.scale - 0.25 }))} aria-label={t('media.beforeAfter.zoomOut')}>
            <ZoomOut className="h-4 w-4" />
          </button>
          <button type="button" className={cn(chip, 'bg-white/10')} onClick={() => patchActive((current) => ({ ...current, scale: current.scale + 0.25 }))} aria-label={t('media.beforeAfter.zoomIn')}>
            <ZoomIn className="h-4 w-4" />
          </button>
          <button type="button" className={cn(chip, 'bg-white/10')} onClick={() => patchActive((current) => ({ ...current, rotation: current.rotation + 90 }))} aria-label={t('media.beforeAfter.rotate')}>
            <RotateCw className="h-4 w-4" />
          </button>
          {['fr', 'nl', 'en'].map((code) => (
            <button
              key={code}
              type="button"
              className={cn(chip, labelLang === code ? 'bg-[#facc15] text-black' : 'bg-white/10')}
              onClick={() => setLabelLang(code)}
            >
              {code.toUpperCase()}
            </button>
          ))}
          <button type="button" className={cn(chip, 'bg-white/10')} onClick={() => setLogoCorner((corner) => nextLogoCorner(corner))}>
            {t('media.beforeAfter.logoCorner')}
          </button>
          <button
            type="button"
            className={cn(chip, showDateStrip ? 'bg-[#facc15] text-black' : 'bg-white/10')}
            onClick={() => setShowDateStrip((value) => !value)}
          >
            {t('media.beforeAfter.dateStrip')}
          </button>
          {template === 'slider' && (
            <button
              type="button"
              className={cn(chip, alignMode ? 'bg-[#facc15] text-black' : 'bg-white/10')}
              onClick={() => setAlignMode((value) => !value)}
            >
              {alignMode ? t('media.beforeAfter.align') : t('media.beforeAfter.templates.slider')}
            </button>
          )}
          <button type="button" className={cn(chip, 'bg-white/10')} onClick={() => onChangeSide?.('before')}>
            <ImageIcon className="mr-1 inline h-4 w-4" />
            {labels.before}
          </button>
          <button type="button" className={cn(chip, 'bg-white/10')} onClick={() => onChangeSide?.('after')}>
            <ImageIcon className="mr-1 inline h-4 w-4" />
            {labels.after}
          </button>
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {TEMPLATES.map((id) => (
            <button
              key={id}
              type="button"
              data-testid={`template-${id}`}
              onClick={() => {
                setTemplate(id);
                setAlignMode(id !== 'slider');
              }}
              className={cn(
                'w-[72px] shrink-0',
                template === id ? 'text-[#facc15]' : 'text-white/70'
              )}
            >
              <div className={cn('mb-1 h-12 overflow-hidden rounded-md ring-2', template === id ? 'ring-[#facc15]' : 'ring-transparent')}>
                <TemplateGlyph id={id} />
              </div>
              <span className="block text-center text-[10px] font-medium leading-tight">{t(`media.beforeAfter.templates.${id}`)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default BeforeAfterComposer;
