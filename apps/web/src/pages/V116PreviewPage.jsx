import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import BeforeAfterComposer from '@/components/media/BeforeAfterComposer';
import BeforeAfterCaptureMode from '@/components/media/BeforeAfterCaptureMode';
import AnnotationEditor from '@/components/capture/AnnotationEditor';
import { exportComparisonJpeg, loadHtmlImage } from '@/lib/beforeAfterRender';
import i18n from '@/i18n';

function wall(kind, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const dirty = kind === 'before';
  ctx.fillStyle = dirty ? '#b7b1a6' : '#e6d7bf';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 1800; i += 1) {
    const x = Math.random() * w;
    const y = Math.random() * h * 0.72;
    ctx.fillStyle = dirty ? 'rgba(80,80,80,0.18)' : 'rgba(255,255,255,0.15)';
    ctx.fillRect(x, y, 2, 2);
  }
  if (dirty) {
    ctx.fillStyle = 'rgba(70,70,70,0.35)';
    ctx.beginPath();
    ctx.ellipse(w * 0.35, h * 0.4, w * 0.18, h * 0.12, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(40,40,40,0.25)';
    ctx.fillRect(w * 0.1, h * 0.55, w * 0.3, h * 0.04);
  } else {
    ctx.fillStyle = 'rgba(40,40,50,0.72)';
    ctx.beginPath();
    ctx.ellipse(w * 0.62, h * 0.28, w * 0.12, h * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(w * 0.52, h * 0.34, w * 0.2, h * 0.32);
    ctx.fillStyle = '#2a2a32';
    ctx.fillRect(w * 0.08, h * 0.7, w * 0.84, 8);
    for (let i = 0; i < 8; i += 1) ctx.fillRect(w * (0.1 + i * 0.1), h * 0.7, 3, h * 0.08);
  }
  ctx.fillStyle = dirty ? '#2c333c' : '#1b1f27';
  ctx.fillRect(0, h * 0.78, w, h * 0.22);
  for (let col = 0; col < 4; col += 1) {
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.strokeRect(col * (w / 4) + 8, h * 0.82, w / 4 - 16, h * 0.12);
  }
  return canvas.toDataURL('image/jpeg', 0.85);
}

const DEMO_DOC = {
  version: 1,
  width: 900,
  height: 1200,
  rotation: 0,
  crop: null,
  shapes: [
    { id: 'arrow', type: 'arrow', x1: 140, y1: 280, x2: 520, y2: 620, color: '#facc15', strokeWidth: 16 },
    { id: 'rect', type: 'rectangle', x: 180, y: 700, w: 420, h: 220, color: '#111111', strokeWidth: 12 },
    { id: 'label', type: 'text', x: 210, y: 760, text: 'Joint à reprendre', color: '#facc15', fontSize: 54, strokeWidth: 8 },
  ],
};

const V116PreviewPage = () => {
  const [params] = useSearchParams();
  const view = params.get('view') || 'composer';
  const template = params.get('template') || 'side-by-side';
  const [shots, setShots] = useState(null);
  const [exported, setExported] = useState(null);
  const [exportSize, setExportSize] = useState('');
  const [langReady, setLangReady] = useState(false);

  useEffect(() => {
    i18n.changeLanguage('fr').then(() => setLangReady(true));
    setShots({ before: wall('before', 900, 1200), after: wall('after', 900, 1200) });
  }, []);

  const beforePhoto = useMemo(() => (shots ? { id: 'before', dataUrl: shots.before, captured_at: '2026-10-08T15:20:00Z' } : null), [shots]);
  const afterPhoto = useMemo(() => (shots ? { id: 'after', dataUrl: shots.after, captured_at: '2026-10-08T16:45:00Z' } : null), [shots]);

  useEffect(() => {
    if (view !== 'export' || !shots) return undefined;
    let cancelled = false;
    (async () => {
      const [beforeImage, afterImage, logoImage] = await Promise.all([
        loadHtmlImage(shots.before),
        loadHtmlImage(shots.after),
        loadHtmlImage('/brand/novakleen-wordmark.svg').catch(() => null),
      ]);
      const file = await exportComparisonJpeg({
        template,
        slider: 58,
        labelLang: 'fr',
        logoCorner: 'top-left',
        showDateStrip: true,
        projectName: 'Façade NovaKleen',
        beforeImage,
        afterImage,
        logoImage,
        stripText: 'Façade NovaKleen  ·  8 oct. 2026',
        date: '2026-10-08T16:45:00Z',
      });
      if (!cancelled) setExported({ url: URL.createObjectURL(file), width: 0, height: 0, name: file.name });
    })();
    return () => {
      cancelled = true;
    };
  }, [view, shots, template]);

  if (!langReady || !shots) return null;

  if (view === 'camera') {
    return (
      <BeforeAfterCaptureMode
        forceMock
        mockFeed={shots.after}
        overlayImage={{ dataUrl: shots.before }}
        initialOverlayMode="edge"
        onCapture={() => {}}
        onClose={() => {}}
      />
    );
  }

  if (view === 'annotate') {
    return (
      <AnnotationEditor
        imageSrc={shots.before}
        initialDocument={DEMO_DOC}
        onSave={() => {}}
        onCancel={() => {}}
      />
    );
  }

  if (view === 'export') {
    return (
      <div data-testid="ba-export" className="relative min-h-screen bg-black">
        {exported && (
          <img
            src={exported.url}
            alt="Export JPEG"
            className="mx-auto block max-h-screen w-full object-contain"
            onLoad={(event) => {
              const node = event.currentTarget;
              setExportSize(`${node.naturalWidth}×${node.naturalHeight}`);
            }}
          />
        )}
        {exportSize && (
          <p className="absolute left-3 top-3 rounded bg-black/80 px-2 py-1 text-xs font-semibold text-[#facc15]">
            JPEG {exportSize}
          </p>
        )}
      </div>
    );
  }

  return (
    <BeforeAfterComposer
      key={template}
      beforePhoto={beforePhoto}
      afterPhoto={afterPhoto}
      projectName="Façade NovaKleen"
      initialTemplate={template}
      onBack={() => {}}
      onSwap={() => {}}
      onChangeSide={() => {}}
      onSave={async () => {}}
    />
  );
};

export default V116PreviewPage;
