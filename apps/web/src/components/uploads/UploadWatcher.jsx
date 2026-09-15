import { useEffect, useRef } from 'react';
import { useUpload } from '@/contexts/UploadContext';

/**
 * A headless component that monitors upload progress for a specific project
 * and triggers a callback when an upload completes.
 * 
 * Using this component prevents the parent (e.g. ProjectDetailPage) from 
 * re-rendering on every upload progress tick.
 */
const UploadWatcher = ({ projectId, onUploadComplete }) => {
  const { uploads } = useUpload();
  const completedSet = useRef(new Set());
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (!uploads) return;

    const projectUploads = Object.values(uploads).filter(u => u.projectId === projectId);
    let hasNewCompletion = false;

    projectUploads.forEach(upload => {
      if (upload.status === 'completed') {
        if (!completedSet.current.has(upload.id)) {
          completedSet.current.add(upload.id);
          hasNewCompletion = true;
        }
      }
    });

    if (hasNewCompletion) {
      // Debounce the callback to avoid multiple refreshes for batch uploads
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      
      timeoutRef.current = setTimeout(() => {
        onUploadComplete();
      }, 500);
    }
  }, [uploads, projectId, onUploadComplete]);

  return null;
};

export default UploadWatcher;