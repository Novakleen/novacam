import { useState, useCallback, useRef } from 'react';

export const useNetworkSpeed = () => {
  const [networkSpeed, setNetworkSpeed] = useState(0); // bytes per second
  const [networkQuality, setNetworkQuality] = useState('unknown'); // slow, medium, fast
  const lastMeasurementTime = useRef(0);

  const determineQuality = (bytesPerSecond) => {
    const mbps = bytesPerSecond / (1024 * 1024);
    if (mbps < 1) return 'slow';
    if (mbps < 5) return 'medium';
    return 'fast';
  };

  const measureSpeed = useCallback((bytesUploaded, durationMs) => {
    if (durationMs <= 0) return;
    
    // Simple speed calculation
    const speed = (bytesUploaded / (durationMs / 1000));
    
    // Smoothing factor to prevent erratic jumps
    setNetworkSpeed(prev => {
      const newSpeed = prev === 0 ? speed : (prev * 0.7 + speed * 0.3);
      setNetworkQuality(determineQuality(newSpeed));
      return newSpeed;
    });
    
    lastMeasurementTime.current = Date.now();
  }, []);

  const getRecommendedChunkSize = useCallback(() => {
    const mb = 1024 * 1024;
    switch (networkQuality) {
      case 'slow': return 5 * mb;
      case 'medium': return 10 * mb;
      case 'fast': return 20 * mb; // Can handle larger chunks
      default: return 5 * mb; // Conservative default
    }
  }, [networkQuality]);

  return {
    networkSpeed,
    networkQuality,
    measureSpeed,
    getRecommendedChunkSize
  };
};