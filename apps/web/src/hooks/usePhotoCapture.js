import { useState, useCallback, useEffect, useRef } from 'react';
import { isImageFile } from '@/lib/imageSizes';
import { dataUrlToFile } from '@/lib/dataUrl';
import {
  clearCaptureRecords,
  clearLegacyCaptureLocalStorage,
  deleteCaptureRecord,
  listCaptureRecords,
  saveCaptureRecord,
} from '@/lib/captureSessionStore';

const META_ID = '__session_meta';

const toFile = (blob, name, type) =>
  blob instanceof File ? blob : new File([blob], name, { type: type || blob.type || 'image/jpeg' });

export const usePhotoCapture = () => {
  const [photos, setPhotos] = useState([]);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(-1);
  const [step, setStep] = useState('capture');
  const [stickyDescription, setStickyDescription] = useState('');
  const [stickyTags, setStickyTags] = useState('');
  const urlsRef = useRef(new Set());
  const stickyRef = useRef({ description: '', tags: '' });
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    stickyRef.current = { description: stickyDescription, tags: stickyTags };
  }, [stickyDescription, stickyTags]);

  const trackUrl = (url) => {
    if (url) urlsRef.current.add(url);
    return url;
  };

  const releaseUrl = (url) => {
    if (!url) return;
    URL.revokeObjectURL(url);
    urlsRef.current.delete(url);
  };

  const persistPhoto = (photo) => {
    saveCaptureRecord({
      id: photo.id,
      blob: photo.file,
      annotatedBlob: photo.annotatedFile || null,
      description: photo.description || '',
      fromCamera: Boolean(photo.fromCamera),
      timestamp: photo.timestamp,
      name: photo.file?.name || `photo-${photo.id}.jpg`,
      type: photo.annotatedFile?.type || photo.file?.type || 'image/jpeg',
    }).catch(() => {});
  };

  useEffect(() => {
    clearLegacyCaptureLocalStorage();
    let cancelled = false;

    (async () => {
      try {
        const records = await listCaptureRecords();
        if (cancelled) return;
        const meta = records.find((record) => record.id === META_ID);
        if (meta) {
          setStickyDescription(meta.description || '');
          setStickyTags(meta.tags || '');
        }
        const restored = records
          .filter((record) => record.id !== META_ID && record.blob)
          .map((record) => {
            const file = toFile(record.blob, record.name || 'photo.jpg', record.type);
            const annotatedFile = record.annotatedBlob
              ? toFile(record.annotatedBlob, `annotated-${record.id}.jpg`, 'image/jpeg')
              : null;
            return {
              id: record.id,
              file,
              annotatedFile,
              objectUrl: trackUrl(URL.createObjectURL(annotatedFile || file)),
              description: record.description || meta?.description || '',
              fromCamera: Boolean(record.fromCamera),
              timestamp: record.timestamp || new Date().toISOString(),
            };
          });
        if (restored.length > 0) {
          setPhotos(restored);
          setCurrentPhotoIndex(restored.length - 1);
          setStep('review');
        }
      } catch (error) {
        console.warn('Capture session could not be restored', error);
      } finally {
        if (!cancelled) setSessionReady(true);
      }
    })();

    return () => {
      cancelled = true;
      urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      urlsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!sessionReady) return;
    saveCaptureRecord({
      id: META_ID,
      description: stickyDescription,
      tags: stickyTags,
    }).catch(() => {});
  }, [sessionReady, stickyDescription, stickyTags]);

  const addFiles = useCallback((fileList, { fromCamera = false } = {}) => {
    const files = [...(fileList || [])].filter((file) => isImageFile(file));
    if (files.length === 0) return [];
    const created = files.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      annotatedFile: null,
      objectUrl: trackUrl(URL.createObjectURL(file)),
      description: stickyRef.current.description,
      fromCamera,
      timestamp: new Date().toISOString(),
    }));
    created.forEach(persistPhoto);
    setPhotos((prev) => [...prev, ...created]);
    setCurrentPhotoIndex((prev) => (prev < 0 ? created.length - 1 : prev + created.length));
    return created;
  }, []);

  const updatePhotoAnnotation = useCallback((index, annotatedDataUrl) => {
    setPhotos((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current) return prev;
      const annotatedFile = dataUrlToFile(annotatedDataUrl, `annotated-${current.id}.jpg`);
      releaseUrl(current.objectUrl);
      const updated = {
        ...current,
        annotatedFile,
        objectUrl: trackUrl(URL.createObjectURL(annotatedFile)),
      };
      next[index] = updated;
      persistPhoto(updated);
      return next;
    });
  }, []);

  const updatePhotoDescription = useCallback((index, description) => {
    setStickyDescription(description);
    setPhotos((prev) => {
      const next = [...prev];
      if (!next[index]) return prev;
      next[index] = { ...next[index], description };
      persistPhoto(next[index]);
      return next;
    });
  }, []);

  const deletePhoto = useCallback((index) => {
    setPhotos((prev) => {
      const removed = prev[index];
      if (removed) {
        releaseUrl(removed.objectUrl);
        deleteCaptureRecord(removed.id).catch(() => {});
      }
      return prev.filter((_, i) => i !== index);
    });
    setCurrentPhotoIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const resetCapture = useCallback(() => {
    setPhotos((prev) => {
      prev.forEach((photo) => releaseUrl(photo.objectUrl));
      return [];
    });
    setCurrentPhotoIndex(-1);
    setStep('capture');
    setStickyDescription('');
    setStickyTags('');
    clearCaptureRecords().catch(() => {});
    clearLegacyCaptureLocalStorage();
  }, []);

  const goToStep = (newStep) => setStep(newStep);

  return {
    photos,
    currentPhotoIndex,
    currentPhoto: photos[currentPhotoIndex],
    step,
    stickyDescription,
    stickyTags,
    setStickyDescription,
    setStickyTags,
    addFiles,
    updatePhotoAnnotation,
    updatePhotoDescription,
    deletePhoto,
    resetCapture,
    goToStep,
    setCurrentPhotoIndex,
  };
};
