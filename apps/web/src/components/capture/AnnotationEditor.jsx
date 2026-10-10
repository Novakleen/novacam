import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Circle,
  Crop,
  MousePointer2,
  Pencil,
  Redo2,
  RotateCw,
  Square,
  Trash2,
  Type,
  Undo2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  ANNOTATION_COLORS,
  STROKE_WIDTHS,
  addShape,
  canRedo,
  canUndo,
  clearShapes,
  createHistory,
  emptyDocument,
  hitTest,
  moveShape,
  normalizeCrop,
  redo,
  removeShape,
  rotateDocument,
  setCrop,
  shapeBounds,
  undo,
  updateShape,
} from '@/lib/annotationCommands';
import { flattenAnnotations, paintAnnotations } from '@/lib/annotationRender';
import { loadHtmlImage } from '@/lib/beforeAfterRender';
import { cn } from '@/lib/utils';

const TOOLS = [
  { id: 'select', icon: MousePointer2 },
  { id: 'pen', icon: Pencil },
  { id: 'arrow', icon: ArrowLeft },
  { id: 'line', icon: MinusIcon },
  { id: 'rectangle', icon: Square },
  { id: 'ellipse', icon: Circle },
  { id: 'text', icon: Type },
  { id: 'crop', icon: Crop },
];

function MinusIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M4 12h16" />
      <path d="M18 8l4 4-4 4" />
    </svg>
  );
}

function scaleDocument(doc, width, height) {
  if (!doc) return emptyDocument(width, height);
  if (doc.width === width && doc.height === height) return { ...emptyDocument(width, height), ...doc, width, height };
  const sx = width / (doc.width || width || 1);
  const sy = height / (doc.height || height || 1);
  const shapes = (doc.shapes || []).map((shape) => {
    if (shape.type === 'freehand') {
      return { ...shape, points: (shape.points || []).map((point) => ({ x: point.x * sx, y: point.y * sy })) };
    }
    if (shape.type === 'line' || shape.type === 'arrow') {
      return { ...shape, x1: shape.x1 * sx, y1: shape.y1 * sy, x2: shape.x2 * sx, y2: shape.y2 * sy };
    }
    if (shape.type === 'text') return { ...shape, x: shape.x * sx, y: shape.y * sy, fontSize: (shape.fontSize || 32) * sy };
    return { ...shape, x: shape.x * sx, y: shape.y * sy, w: shape.w * sx, h: shape.h * sy };
  });
  return { ...doc, width, height, shapes };
}

function clientToDoc(event, canvas, doc) {
  const rect = canvas.getBoundingClientRect();
  const vx = (event.clientX - rect.left) / Math.max(1, rect.width);
  const vy = (event.clientY - rect.top) / Math.max(1, rect.height);
  const crop = normalizeCrop(doc.crop);
  return {
    x: (crop.x + vx * crop.w) * doc.width,
    y: (crop.y + vy * crop.h) * doc.height,
  };
}

const AnnotationEditor = ({ imageSrc, initialDocument = null, onSave, onCancel, saving = false }) => {
  const { t } = useTranslation();
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const historyRef = useRef(createHistory(emptyDocument()));
  const dragRef = useRef(null);
  const [image, setImage] = useState(null);
  const [history, setHistory] = useState(() => createHistory(emptyDocument()));
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState(ANNOTATION_COLORS[0]);
  const [strokeWidth, setStrokeWidth] = useState(STROKE_WIDTHS[1]);
  const [selectedId, setSelectedId] = useState(null);
  const [drag, setDrag] = useState(null);
  const [textPrompt, setTextPrompt] = useState(null);
  const [textValue, setTextValue] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  const initialRef = useRef(initialDocument);

  useEffect(() => {
    let cancelled = false;
    loadHtmlImage(imageSrc)
      .then((loaded) => {
        if (cancelled) return;
        imageRef.current = loaded;
        setImage(loaded);
        const maxEdge = 1600;
        const scale = Math.min(1, maxEdge / Math.max(loaded.naturalWidth, loaded.naturalHeight));
        const width = Math.max(1, Math.round(loaded.naturalWidth * scale));
        const height = Math.max(1, Math.round(loaded.naturalHeight * scale));
        const doc = scaleDocument(initialRef.current, width, height);
        const next = createHistory(doc.width ? doc : emptyDocument(width, height));
        historyRef.current = next;
        setHistory(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [imageSrc]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    const doc = drag?.shape
      ? { ...history.present, shapes: [...history.present.shapes, drag.shape] }
      : drag?.kind === 'move'
        ? moveShape(history, drag.id, drag.dx, drag.dy).present
        : history.present;
    const crop = normalizeCrop(doc.crop);
    canvas.width = Math.max(1, Math.round(doc.width * crop.w));
    canvas.height = Math.max(1, Math.round(doc.height * crop.h));
    const ctx = canvas.getContext('2d');
    paintAnnotations(ctx, image, doc);
    const activeId = drag?.kind === 'move' ? drag.id : selectedId;
    const shape = doc.shapes.find((item) => item.id === activeId);
    const bounds = shapeBounds(shape);
    if (bounds) {
      ctx.save();
      ctx.translate(-crop.x * doc.width, -crop.y * doc.height);
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(bounds.x - 6, bounds.y - 6, Math.max(8, bounds.w) + 12, Math.max(8, bounds.h) + 12);
      ctx.restore();
    }
  }, [history, image, drag, selectedId]);

  useEffect(() => {
    const onKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
        event.preventDefault();
        setHistory((current) => (event.shiftKey ? redo(current) : undo(current)));
      } else if ((event.ctrlKey || event.metaKey) && event.key === 'y') {
        event.preventDefault();
        setHistory((current) => redo(current));
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        if (textPrompt) return;
        if (selectedId) {
          event.preventDefault();
          setHistory((current) => removeShape(current, selectedId));
          setSelectedId(null);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, textPrompt]);

  const applyColor = (next) => {
    setColor(next);
    if (selectedId && tool === 'select') {
      setHistory((current) => updateShape(current, selectedId, { color: next }));
    }
  };

  const applyStroke = (next) => {
    setStrokeWidth(next);
    if (selectedId && tool === 'select') {
      setHistory((current) => updateShape(current, selectedId, { strokeWidth: next, fontSize: Math.max(28, next * 6) }));
    }
  };

  const pointerDown = (event) => {
    if (!image || tool === 'text') return;
    const canvas = canvasRef.current;
    canvas.setPointerCapture(event.pointerId);
    const point = clientToDoc(event, canvas, historyRef.current.present);
    if (tool === 'select') {
      const id = hitTest(historyRef.current.present, point.x, point.y);
      setSelectedId(id);
      if (id) dragRef.current = { kind: 'move', id, x: point.x, y: point.y, dx: 0, dy: 0 };
      return;
    }
    if (tool === 'crop') {
      dragRef.current = { kind: 'crop', x: point.x, y: point.y };
      return;
    }
    const shape = {
      id: `draft-${tool}`,
      type: tool === 'pen' ? 'freehand' : tool,
      color,
      strokeWidth,
      points: [{ ...point }],
      x1: point.x,
      y1: point.y,
      x2: point.x,
      y2: point.y,
      x: point.x,
      y: point.y,
      w: 0,
      h: 0,
    };
    dragRef.current = { kind: 'draw', shape };
    setDrag({ kind: 'draw', shape });
  };

  const pointerMove = (event) => {
    const dragState = dragRef.current;
    if (!dragState) return;
    const point = clientToDoc(event, canvasRef.current, historyRef.current.present);
    if (dragState.kind === 'move') {
      const dx = point.x - dragState.x;
      const dy = point.y - dragState.y;
      dragRef.current = { ...dragState, dx, dy };
      setDrag({ kind: 'move', id: dragState.id, dx, dy });
      return;
    }
    if (dragState.kind === 'crop') return;
    const shape = { ...dragState.shape };
    if (shape.type === 'freehand') shape.points = [...shape.points, point];
    else if (shape.type === 'line' || shape.type === 'arrow') {
      shape.x2 = point.x;
      shape.y2 = point.y;
    } else {
      shape.x = Math.min(dragState.shape.x1, point.x);
      shape.y = Math.min(dragState.shape.y1, point.y);
      shape.w = Math.abs(point.x - dragState.shape.x1);
      shape.h = Math.abs(point.y - dragState.shape.y1);
    }
    dragRef.current = { kind: 'draw', shape };
    setDrag({ kind: 'draw', shape });
  };

  const pointerUp = (event) => {
    const dragState = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!dragState) {
      if (tool === 'text') {
        const point = clientToDoc(event, canvasRef.current, historyRef.current.present);
        setTextPrompt(point);
        setTextValue('');
      }
      return;
    }
    if (dragState.kind === 'move') {
      setHistory((current) => moveShape(current, dragState.id, dragState.dx, dragState.dy));
      return;
    }
    if (dragState.kind === 'crop') {
      const point = clientToDoc(event, canvasRef.current, historyRef.current.present);
      const doc = historyRef.current.present;
      const x = Math.min(dragState.x, point.x) / doc.width;
      const y = Math.min(dragState.y, point.y) / doc.height;
      const w = Math.abs(point.x - dragState.x) / doc.width;
      const h = Math.abs(point.y - dragState.y) / doc.height;
      if (w > 0.02 && h > 0.02) setHistory((current) => setCrop(current, { x, y, w, h }));
      return;
    }
    const shape = { ...dragState.shape, id: undefined };
    if (shape.type === 'freehand' && (shape.points || []).length < 2) return;
    if ((shape.type === 'rectangle' || shape.type === 'ellipse') && shape.w < 2 && shape.h < 2) return;
    setHistory((current) => addShape(current, shape));
  };

  const commitText = () => {
    const value = textValue.trim();
    if (value && textPrompt) {
      setHistory((current) =>
        addShape(current, {
          type: 'text',
          x: textPrompt.x,
          y: textPrompt.y,
          text: value,
          color,
          strokeWidth,
          fontSize: Math.max(28, strokeWidth * 6),
        })
      );
    }
    setTextPrompt(null);
    setTextValue('');
  };

  const handleSave = async () => {
    if (!image || busy) return;
    setBusy(true);
    try {
      const flat = await flattenAnnotations(image, historyRef.current.present);
      await onSave?.({ document: historyRef.current.present, dataUrl: flat.dataUrl, file: flat.file });
    } finally {
      setBusy(false);
    }
  };

  const toolLabel = {
    select: t('media.annotate.select'),
    pen: t('media.annotate.pen'),
    arrow: t('media.annotate.arrow'),
    line: t('media.annotate.line'),
    rectangle: t('media.annotate.rect'),
    ellipse: t('media.annotate.ellipse'),
    text: t('media.annotate.text'),
    crop: t('media.annotate.crop'),
  };

  return (
    <div data-testid="annotation-editor" className="fixed inset-0 z-[10000] flex flex-col bg-black text-white">
      <header className="flex items-center gap-2 px-2 py-2">
        <Button variant="ghost" size="icon" className="text-white h-11 w-11" onClick={onCancel} aria-label={t('common.cancel')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="flex-1 text-base font-semibold">{t('media.annotate.title')}</h1>
        <Button
          variant="ghost"
          size="icon"
          className="text-white h-11 w-11"
          disabled={!canUndo(history)}
          onClick={() => setHistory((current) => undo(current))}
          aria-label={t('media.annotate.undo')}
        >
          <Undo2 className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-white h-11 w-11"
          disabled={!canRedo(history)}
          onClick={() => setHistory((current) => redo(current))}
          aria-label={t('media.annotate.redo')}
        >
          <Redo2 className="h-5 w-5" />
        </Button>
        <Button
          className="h-11 bg-[#facc15] text-black hover:bg-[#eab308] font-semibold"
          onClick={handleSave}
          disabled={!image || busy || saving}
        >
          <Check className="h-4 w-4 mr-1" />
          {t('media.annotate.done')}
        </Button>
      </header>

      <div className="relative flex-1 min-h-0 flex items-center justify-center px-2">
        <canvas
          ref={canvasRef}
          className="max-w-full max-h-full touch-none bg-neutral-900"
          style={{ touchAction: 'none' }}
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onPointerCancel={pointerUp}
        />
        {textPrompt && (
          <form
            className="absolute bottom-3 left-3 right-3 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              commitText();
            }}
          >
            <input
              autoFocus
              value={textValue}
              onChange={(event) => setTextValue(event.target.value)}
              placeholder={t('media.annotate.textPrompt')}
              className="flex-1 h-11 rounded-lg px-3 text-black"
            />
            <Button type="submit" className="h-11 bg-[#facc15] text-black hover:bg-[#eab308]">
              {t('common.confirm')}
            </Button>
          </form>
        )}
      </div>

      <div className="bg-[#0b1220] px-3 pt-3 pb-4 space-y-3">
        <div className="flex items-center gap-2 overflow-x-auto">
          {ANNOTATION_COLORS.map((swatch) => (
            <button
              key={swatch}
              type="button"
              aria-label={swatch === '#facc15' ? t('media.annotate.yellow') : swatch}
              onClick={() => applyColor(swatch)}
              className={cn(
                'h-9 w-9 shrink-0 rounded-full border-2',
                color === swatch ? 'border-white' : 'border-transparent'
              )}
              style={{ backgroundColor: swatch }}
            />
          ))}
          <span className="mx-1 h-6 w-px bg-white/20" />
          {STROKE_WIDTHS.map((width) => (
            <button
              key={width}
              type="button"
              aria-label={t('media.annotate.width')}
              onClick={() => applyStroke(width)}
              className={cn(
                'h-9 w-9 shrink-0 rounded-full flex items-center justify-center',
                strokeWidth === width ? 'bg-white text-black' : 'bg-white/10'
              )}
            >
              <span className="rounded-full bg-current" style={{ width: width + 2, height: width + 2 }} />
            </button>
          ))}
        </div>
        <div className="flex gap-1 overflow-x-auto pb-1">
          {TOOLS.map(({ id, icon: Icon }) => (
            <button
              key={id}
              type="button"
              data-testid={`tool-${id}`}
              onClick={() => {
                setTool(id);
                if (id !== 'select') setSelectedId(null);
              }}
              className={cn(
                'flex flex-col items-center justify-center min-w-[64px] h-14 rounded-xl text-[10px] font-medium',
                tool === id ? 'bg-[#facc15] text-black' : 'bg-white/10 text-white'
              )}
            >
              <Icon className={cn('h-4 w-4 mb-0.5', id === 'arrow' && 'rotate-180')} />
              {toolLabel[id]}
            </button>
          ))}
          <button
            type="button"
            className="flex flex-col items-center justify-center min-w-[64px] h-14 rounded-xl bg-white/10 text-[10px]"
            onClick={() => setHistory((current) => rotateDocument(current, 90))}
          >
            <RotateCw className="h-4 w-4 mb-0.5" />
            {t('media.annotate.rotate')}
          </button>
          <button
            type="button"
            className="flex flex-col items-center justify-center min-w-[64px] h-14 rounded-xl bg-white/10 text-[10px]"
            onClick={() => {
              if (window.confirm(t('media.annotate.clearConfirm'))) {
                setHistory((current) => clearShapes(current));
                setSelectedId(null);
              }
            }}
          >
            <Trash2 className="h-4 w-4 mb-0.5" />
            {t('media.annotate.clear')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AnnotationEditor;
