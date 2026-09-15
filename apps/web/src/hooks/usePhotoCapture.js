import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'novakleen_capture_session';

export const usePhotoCapture = () => {
  const [photos, setPhotos] = useState([]);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(-1);
  const [step, setStep] = useState('capture'); // 'capture', 'annotate', 'describe', 'review'

  // Load from local storage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setPhotos(parsed);
          // Don't auto-restore state to avoid confusion, just have the data ready
        }
      } catch (e) {
        console.error("Failed to parse saved photos", e);
      }
    }
  }, []);

  // Save to local storage on change
  useEffect(() => {
    if (photos.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(photos));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [photos]);

  const addPhoto = useCallback((dataUrl) => {
    const newPhoto = {
      id: Date.now().toString(),
      originalDataUrl: dataUrl,
      annotatedDataUrl: dataUrl, // Initially same as original
      description: '',
      timestamp: new Date().toISOString()
    };
    
    setPhotos(prev => [...prev, newPhoto]);
    setCurrentPhotoIndex(prev => prev + 1);
    setStep('annotate'); // Move to annotation immediately after capture
  }, []);

  const updatePhotoAnnotation = useCallback((index, annotatedDataUrl) => {
    setPhotos(prev => {
      const newPhotos = [...prev];
      if (newPhotos[index]) {
        newPhotos[index] = { ...newPhotos[index], annotatedDataUrl };
      }
      return newPhotos;
    });
  }, []);

  const updatePhotoDescription = useCallback((index, description) => {
    setPhotos(prev => {
      const newPhotos = [...prev];
      if (newPhotos[index]) {
        newPhotos[index] = { ...newPhotos[index], description };
      }
      return newPhotos;
    });
  }, []);

  const deletePhoto = useCallback((index) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
    if (currentPhotoIndex >= index) {
      setCurrentPhotoIndex(prev => Math.max(0, prev - 1));
    }
  }, [currentPhotoIndex]);

  const retakePhoto = useCallback((index) => {
    // Determine which photo to retake. Usually the current one.
    // For simplicity in this flow, "retake" might just mean go back to capture mode
    // and remove the current partial photo if it exists.
    if (index >= 0) {
        setPhotos(prev => prev.filter((_, i) => i !== index));
        setCurrentPhotoIndex(prev => Math.max(-1, prev - 1));
    }
    setStep('capture');
  }, []);

  const resetCapture = useCallback(() => {
    setPhotos([]);
    setCurrentPhotoIndex(-1);
    setStep('capture');
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const goToStep = (newStep) => setStep(newStep);

  return {
    photos,
    currentPhotoIndex,
    currentPhoto: photos[currentPhotoIndex],
    step,
    addPhoto,
    updatePhotoAnnotation,
    updatePhotoDescription,
    deletePhoto,
    retakePhoto,
    resetCapture,
    goToStep,
    setCurrentPhotoIndex
  };
};