import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/components/ui/use-toast';
import { sobelEdges } from '@/lib/edgeDetect';
import { loadHtmlImage } from '@/lib/beforeAfterRender';
import { cn } from '@/lib/utils';

const BeforeAfterCaptureMode = ({
  overlayImage,
  onCapture,
  onClose,
  forceMock = false,
  mockFeed = null,
  initialOverlayMode = 'ghost',
}) => {
  const videoRef = useRef(null);
  const mockRef = useRef(null);
  const edgeCanvasRef = useRef(null);
  const streamRef = useRef(null);
  const [facingMode, setFacingMode] = useState('environment');
  const [overlayOpacity, setOverlayOpacity] = useState(0.5);
  const [overlayMode, setOverlayMode] = useState(initialOverlayMode);
  const { toast } = useToast();
  const { t } = useTranslation();
  const useMock = forceMock || Boolean(mockFeed);

  useEffect(() => {
    if (useMock) return undefined;
    let cancelled = false;

    const startCamera = async () => {
      try {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (cancelled) {
          newStream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = newStream;
        if (videoRef.current) videoRef.current.srcObject = newStream;
      } catch (err) {
        console.error('Error accessing camera:', err);
        toast({
          variant: 'destructive',
          title: t('media.beforeAfter.cameraError'),
          description: t('media.beforeAfter.cameraErrorHint'),
        });
      }
    };

    startCamera();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [facingMode, useMock, t, toast]);

  useEffect(() => {
    if (overlayMode !== 'edge' || !overlayImage) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const image = await loadHtmlImage(overlayImage.file_url || overlayImage.dataUrl);
        if (cancelled) return;
        const max = 480;
        const scale = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight));
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const off = document.createElement('canvas');
        off.width = width;
        off.height = height;
        const source = off.getContext('2d', { willReadFrequently: true });
        source.drawImage(image, 0, 0, width, height);
        const pixels = source.getImageData(0, 0, width, height);
        const edges = sobelEdges(pixels.data, width, height, 42);
        const canvas = edgeCanvasRef.current;
        if (!canvas || cancelled) return;
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').putImageData(new ImageData(edges, width, height), 0, 0);
      } catch (error) {
        console.error(error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [overlayMode, overlayImage]);

  const handleCapture = () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!useMock && videoRef.current?.videoWidth) {
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      if (facingMode === 'user') {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(videoRef.current, 0, 0);
    } else if (mockRef.current) {
      canvas.width = mockRef.current.naturalWidth || 900;
      canvas.height = mockRef.current.naturalHeight || 1200;
      ctx.drawImage(mockRef.current, 0, 0, canvas.width, canvas.height);
    } else {
      return;
    }
    onCapture(canvas.toDataURL('image/jpeg', 0.9));
  };

  return (
    <div data-testid="after-camera" className="fixed inset-0 z-[80] flex flex-col bg-black">
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent p-4">
        <h3 className="font-medium text-white">
          {overlayImage ? t('media.beforeAfter.align') : t('media.beforeAfter.capture')}
        </h3>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-11 w-11 rounded-full text-white hover:bg-white/20" aria-label={t('common.cancel')}>
          <X className="h-6 w-6" />
        </Button>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-black">
        {useMock ? (
          <img ref={mockRef} src={mockFeed || ''} alt="" className="h-full w-full object-cover" />
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={cn('h-full w-full object-cover', facingMode === 'user' && 'scale-x-[-1]')}
          />
        )}

        {overlayImage && overlayMode === 'ghost' && (
          <div className="pointer-events-none absolute inset-0" style={{ opacity: overlayOpacity }}>
            <img
              src={overlayImage.file_url || overlayImage.dataUrl}
              alt=""
              className="h-full w-full object-cover blur-[2px]"
            />
          </div>
        )}

        {overlayImage && overlayMode === 'edge' && (
          <canvas
            ref={edgeCanvasRef}
            data-testid="edge-overlay"
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            style={{ opacity: overlayOpacity }}
          />
        )}

        <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-40">
          <div className="border-b border-r border-white" />
          <div className="border-b border-r border-white" />
          <div className="border-b border-white" />
          <div className="border-b border-r border-white" />
          <div className="border-b border-r border-white" />
          <div className="border-b border-white" />
          <div className="border-r border-white" />
          <div className="border-r border-white" />
          <div />
        </div>
      </div>

      <div className="space-y-4 bg-black/90 p-4 pb-8">
        {overlayImage && (
          <div className="mx-auto w-full max-w-xs space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                data-testid="overlay-ghost"
                onClick={() => setOverlayMode('ghost')}
                className={cn(
                  'h-11 rounded-full text-sm font-semibold',
                  overlayMode === 'ghost' ? 'bg-[#facc15] text-black' : 'bg-white/15 text-white'
                )}
              >
                {t('media.beforeAfter.ghost')}
              </button>
              <button
                type="button"
                data-testid="overlay-edges"
                onClick={() => setOverlayMode('edge')}
                className={cn(
                  'h-11 rounded-full text-sm font-semibold',
                  overlayMode === 'edge' ? 'bg-[#facc15] text-black' : 'bg-white/15 text-white'
                )}
              >
                {t('media.beforeAfter.edges')}
              </button>
            </div>
            <div className="flex justify-between text-xs text-gray-400">
              <span>{t('media.beforeAfter.overlayHidden')}</span>
              <span>{t('media.beforeAfter.overlay')}</span>
              <span>{t('media.beforeAfter.overlayVisible')}</span>
            </div>
            <Slider
              value={[overlayOpacity * 100]}
              onValueChange={(val) => setOverlayOpacity(val[0] / 100)}
              max={100}
              step={1}
              className="py-2"
            />
          </div>
        )}

        <div className="mx-auto flex w-full max-w-sm items-center justify-between">
          <div className="h-12 w-12" />
          <button
            type="button"
            data-testid="shutter"
            onClick={handleCapture}
            className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white active:scale-95"
            aria-label={t('media.beforeAfter.capture')}
          >
            <div className="h-16 w-16 rounded-full bg-white" />
          </button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'))}
            className="h-12 w-12 rounded-full text-white hover:bg-white/20"
            aria-label={t('media.beforeAfter.rotate')}
          >
            <RefreshCw className="h-6 w-6" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default BeforeAfterCaptureMode;
