import React, { useRef, useState, useEffect } from 'react';
import { Camera, X, RefreshCw, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';

const BeforeAfterCaptureMode = ({ overlayImage, onCapture, onClose }) => {
  const videoRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [facingMode, setFacingMode] = useState('environment');
  const [overlayOpacity, setOverlayOpacity] = useState(0.5);
  const { toast } = useToast();

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [facingMode]);

  const startCamera = async () => {
    try {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      
      const constraints = {
        video: {
          facingMode: facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      };
      
      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(newStream);
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      toast({
        variant: "destructive",
        title: "Camera Error",
        description: "Could not access camera. Please check permissions."
      });
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const handleCapture = () => {
    if (!videoRef.current) return;

    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');

    // Mirror if using front camera
    if (facingMode === 'user') {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
    }

    ctx.drawImage(videoRef.current, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    onCapture(dataUrl);
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-20 bg-gradient-to-b from-black/80 to-transparent">
        <h3 className="text-white font-medium">
          {overlayImage ? "Align with Before Photo" : "Capture Photo"}
        </h3>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={onClose}
          className="text-white hover:bg-white/20 rounded-full"
        >
          <X className="h-6 w-6" />
        </Button>
      </div>

      {/* Camera View */}
      <div className="flex-1 relative flex items-center justify-center bg-black overflow-hidden">
        <video 
          ref={videoRef}
          autoPlay 
          playsInline
          className={cn(
            "w-full h-full object-cover",
            facingMode === 'user' && "scale-x-[-1]"
          )}
        />
        
        {/* Overlay Image (Translucent) */}
        {overlayImage && (
          <div 
            className="absolute inset-0 pointer-events-none transition-opacity duration-100"
            style={{ opacity: overlayOpacity }}
          >
            <img 
              src={overlayImage.file_url || overlayImage.dataUrl} 
              alt="Overlay" 
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Grid Overlay */}
        <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 opacity-30">
          <div className="border-r border-b border-white"></div>
          <div className="border-r border-b border-white"></div>
          <div className="border-b border-white"></div>
          <div className="border-r border-b border-white"></div>
          <div className="border-r border-b border-white"></div>
          <div className="border-b border-white"></div>
          <div className="border-r border-white"></div>
          <div className="border-r border-white"></div>
          <div></div>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-black/90 p-6 pb-8 space-y-6">
        {overlayImage && (
          <div className="space-y-2 max-w-xs mx-auto w-full">
            <div className="flex justify-between text-xs text-gray-400">
              <span>Hidden</span>
              <span>Overlay Opacity</span>
              <span>Visible</span>
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

        <div className="flex items-center justify-between max-w-sm mx-auto w-full">
          <div className="w-12 h-12" /> {/* Spacer */}

          <button 
            onClick={handleCapture}
            className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center relative group active:scale-95 transition-transform"
          >
            <div className="w-16 h-16 bg-white rounded-full group-active:bg-gray-200 transition-colors" />
          </button>

          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setFacingMode(prev => prev === 'user' ? 'environment' : 'user')}
            className="text-white hover:bg-white/20 rounded-full w-12 h-12"
          >
            <RefreshCw className="h-6 w-6" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default BeforeAfterCaptureMode;