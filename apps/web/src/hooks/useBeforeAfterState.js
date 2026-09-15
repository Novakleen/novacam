import { useState, useCallback } from 'react';

export const useBeforeAfterState = () => {
  const [beforePhoto, setBeforePhoto] = useState(null);
  const [afterPhoto, setAfterPhoto] = useState(null);
  const [editorMode, setEditorMode] = useState('initial'); // 'initial', 'capture', 'gallery', 'preview'
  const [captureMode, setCaptureMode] = useState(null); // 'before' or 'after'
  const [activeSlot, setActiveSlot] = useState(null); // 'before' or 'after' which is currently being edited
  const [errors, setErrors] = useState([]);

  const updateBeforePhoto = useCallback((photo) => {
    setBeforePhoto(photo);
    setErrors(prev => prev.filter(e => e.type !== 'before_missing'));
  }, []);

  const updateAfterPhoto = useCallback((photo) => {
    setAfterPhoto(photo);
    setErrors(prev => prev.filter(e => e.type !== 'after_missing'));
  }, []);

  const resetPhotos = useCallback(() => {
    setBeforePhoto(null);
    setAfterPhoto(null);
    setEditorMode('initial');
    setErrors([]);
  }, []);

  const getValidationErrors = useCallback(() => {
    const newErrors = [];
    if (!beforePhoto) newErrors.push({ type: 'before_missing', message: 'Before photo is missing' });
    if (!afterPhoto) newErrors.push({ type: 'after_missing', message: 'After photo is missing' });
    setErrors(newErrors);
    return newErrors;
  }, [beforePhoto, afterPhoto]);

  const cleanup = useCallback(() => {
    // Revoke object URLs if they were created from Blobs (not applicable if using Supabase URLs directly, but good practice if extending)
    resetPhotos();
  }, [resetPhotos]);

  return {
    beforePhoto,
    afterPhoto,
    editorMode,
    captureMode,
    activeSlot,
    errors,
    setBeforePhoto: updateBeforePhoto,
    setAfterPhoto: updateAfterPhoto,
    setEditorMode,
    setCaptureMode,
    setActiveSlot,
    resetPhotos,
    getValidationErrors,
    cleanup
  };
};