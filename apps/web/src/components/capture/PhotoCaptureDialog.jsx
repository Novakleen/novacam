import React, { useRef, useState, useEffect, useCallback } from 'react';
import { X, Camera, RefreshCw, Maximize2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const PhotoCaptureDialog = ({ open, onClose, onCapture, photoCount, isDisabled }) => {
  const videoRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [error, setError] = useState(null);
  const [facingMode, setFacingMode] = useState('environment'); // 'user' or 'environment'

  const startCamera = useCallback(async () => {
    if (isDisabled) return; // Don't start camera if disabled

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
      setError(null);
    } catch (err) {
      console.error("Error accessing camera:", err);
      setError("Could not access camera. Please check permissions.");
    }
  }, [facingMode, isDisabled]);

  useEffect(() => {
    if (open && !isDisabled) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [open, startCamera, isDisabled]);

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const switchCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  const takePhoto = () => {
    if (isDisabled || !videoRef.current) return;

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
    <div className={cn(
      "fixed inset-0 z-50 bg-black flex flex-col",
      !open && "hidden"
    )}>
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-10 bg-gradient-to-b from-black/50 to-transparent">
        <div className="bg-black/30 backdrop-blur-md px-3 py-1 rounded-full text-white text-sm font-medium border border-white/10">
          {photoCount} captured
        </div>
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
        {isDisabled ? (
          <div className="text-white text-center p-6 flex flex-col items-center animate-in fade-in duration-300">
             <AlertCircle className="h-12 w-12 text-yellow-500 mb-4" />
             <h3 className="text-xl font-semibold mb-2">Photo Captured</h3>
             <p className="text-gray-400 max-w-xs">You have already captured a photo for this session.</p>
          </div>
        ) : error ? (
          <div className="text-white text-center p-6">
            <p className="mb-4 text-red-400">{error}</p>
            <Button onClick={startCamera} variant="outline" className="text-black border-white/20">
              Retry Camera
            </Button>
          </div>
        ) : (
          <video 
            ref={videoRef}
            autoPlay 
            playsInline
            className={cn(
               "w-full h-full object-cover",
               facingMode === 'user' && "scale-x-[-1]"
            )}
          />
        )}
        
        {/* Controls Overlay - Hide if disabled */}
        {!isDisabled && !error && (
          <div className="absolute bottom-0 left-0 right-0 p-8 pb-12 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex items-center justify-between">
              {/* Spacer */}
              <div className="w-12 h-12" /> 

              {/* Shutter Button */}
              <button 
                onClick={takePhoto}
                className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center relative group active:scale-95 transition-transform"
              >
                <div className="w-16 h-16 bg-white rounded-full group-active:bg-gray-200 transition-colors" />
              </button>

              {/* Switch Camera */}
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={switchCamera}
                className="text-white hover:bg-white/20 rounded-full w-12 h-12"
              >
                <RefreshCw className="h-6 w-6" />
              </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PhotoCaptureDialog;