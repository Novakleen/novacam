import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { generateVideoThumbnail } from '@/lib/mediaUtils';
import { isImageFile, buildVariantPaths } from '@/lib/imageSizes';
import { processImageFile, tryGeolocation } from '@/lib/processImage';
import { uploadStorageObject } from '@/lib/mediaStorage';
import { attachTagNames, buildImageMediaInsert } from '@/lib/uploadProjectImage';

const UploadContext = createContext({});

export const useUpload = () => useContext(UploadContext);

const MAX_CONCURRENT_UPLOADS = 3;
const MAX_RETRIES = 3;
const STALL_TIMEOUT = 60000; // 60 seconds without progress triggers warning/timeout

export const UploadProvider = ({ children }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [uploads, setUploads] = useState({});
  const [isExpanded, setIsExpanded] = useState(true);
  const [queue, setQueue] = useState([]);
  const [activeCount, setActiveCount] = useState(0);
  
  const xhrRefs = useRef({});
  const watchdogRefs = useRef({});
  const imageJobsRef = useRef({});

  // Queue Processor
  useEffect(() => {
    if (activeCount < MAX_CONCURRENT_UPLOADS && queue.length > 0) {
      const nextUploadId = queue[0];
      setQueue(prev => prev.slice(1));
      setActiveCount(prev => prev + 1);
      
      const upload = uploads[nextUploadId];
      if (upload && upload.status === 'queued') {
        console.log(`[UploadManager] Dequeued ${nextUploadId}, starting upload.`);
        processUpload(nextUploadId, upload.file, upload.path, upload.projectId, upload.thumbnailBlob);
      } else {
        console.warn(`[UploadManager] Queue item ${nextUploadId} invalid or not queued.`);
        setActiveCount(prev => Math.max(0, prev - 1));
      }
    }
  }, [activeCount, queue, uploads]);

  const updateUploadStatus = (uploadId, updates) => {
    setUploads(prev => ({
      ...prev,
      [uploadId]: { ...prev[uploadId], ...updates, lastUpdated: Date.now() }
    }));

    // DB Update for major status changes
    if (updates.status === 'completed' || updates.status === 'error') {
      const dbUpdates = { 
        status: updates.status, 
        progress: updates.progress,
        updated_at: new Date().toISOString()
      };
      
      if (updates.status === 'completed') dbUpdates.completed_at = new Date().toISOString();
      if (updates.error) dbUpdates.error_message = updates.error;

      supabase.from('upload_logs').update(dbUpdates).eq('id', uploadId).then(({ error }) => {
        if (error) console.error(`[UploadManager] Failed to update log for ${uploadId}:`, error);
      });
    }
  };

  const addUpload = async (originalFile, projectId, options = {}) => {
    console.log(`[UploadManager] Adding file: ${originalFile.name} (${originalFile.size} bytes)`);
    try {
      // 1. Create DB Record
      const { data: logData, error: logError } = await supabase
        .from('upload_logs')
        .insert({
          user_id: user.id,
          project_id: projectId,
          file_name: originalFile.name,
          file_size: originalFile.size,
          file_type: originalFile.type,
          status: 'compressing'
        })
        .select()
        .single();

      if (logError) throw logError;

      const uploadId = logData.id;
      const imageFile = isImageFile(originalFile);
      let fileToUpload = originalFile;
      let filePath = `${projectId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${(originalFile.name.split('.').pop() || 'bin')}`;
      let imageJob = null;

      if (imageFile) {
        const processed = await processImageFile(originalFile);
        const paths = buildVariantPaths(projectId, processed.extension);
        await uploadStorageObject(paths.thumbnail, processed.thumbnail, processed.contentType);
        await uploadStorageObject(paths.web, processed.web, processed.contentType);
        const geoPromise =
          options.requestGeolocation && processed.metadata.latitude == null
            ? tryGeolocation(4000)
            : Promise.resolve(null);
        imageJob = { processed, paths, geoPromise, options };
        imageJobsRef.current[uploadId] = imageJob;
        fileToUpload = processed.original;
        filePath = paths.original;
      }

      // 2. Initial State
      setUploads(prev => ({
        ...prev,
        [uploadId]: {
          id: uploadId,
          file: originalFile, // Use original first, update if compressed
          fileName: originalFile.name,
          projectId,
          status: 'compressing',
          progress: 0,
          size: originalFile.size,
          speed: 0,
          eta: null,
          path: filePath,
          retryCount: 0,
          startTime: Date.now(),
          lastUpdated: Date.now()
        }
      }));

      // 3. Video thumbnail (images were prepared above)
      let thumbnailBlob = null;

      if (!imageFile && originalFile.type.startsWith('video/')) {
        try {
          const thumbData = await generateVideoThumbnail(originalFile);
          thumbnailBlob = thumbData?.blob || null;
        } catch (err) {
          console.warn('[UploadManager] Thumbnail generation failed', err);
        }
      }

      // 4. Add to Queue
      setUploads(prev => ({
        ...prev,
        [uploadId]: {
          ...prev[uploadId],
          file: fileToUpload,
          thumbnailBlob: thumbnailBlob,
          size: fileToUpload.size,
          status: 'queued'
        }
      }));
      
      setQueue(prev => [...prev, uploadId]);
      if (!isExpanded) setIsExpanded(true);

    } catch (error) {
      console.error("[UploadManager] Failed to initialize upload", error);
      toast({ variant: "destructive", title: "Failed to start upload", description: error.message });
    }
  };

  const processUpload = async (uploadId, file, path, projectId, thumbnailBlob, retryCount = 0) => {
    console.log(`[UploadManager] Processing ${uploadId} - Attempt ${retryCount + 1}`);
    updateUploadStatus(uploadId, { status: 'uploading', retryCount });
    
    try {
      // 0. Upload Thumbnail if exists (for video)
      let thumbnailUrl = null;
      if (thumbnailBlob && retryCount === 0) { 
        try {
          const thumbPath = path.substring(0, path.lastIndexOf('.')) + '_thumb.jpg';
          const { error: thumbError } = await supabase.storage
            .from('project-media')
            .upload(thumbPath, thumbnailBlob, {
              contentType: 'image/jpeg',
              upsert: true
            });
            
          if (!thumbError) {
            const { data: thumbPublic } = supabase.storage.from('project-media').getPublicUrl(thumbPath);
            thumbnailUrl = thumbPublic.publicUrl;
          }
        } catch (thumbErr) {
          console.warn('[UploadManager] Thumbnail upload failed, continuing with main file:', thumbErr);
        }
      }

      // 1. Get Signed URL for main file
      // Using createSignedUploadUrl allows us to use XHR for progress tracking
      const { data: signedData, error: signedError } = await supabase.storage
        .from('project-media')
        .createSignedUploadUrl(path);

      if (signedError) throw signedError;

      // 2. Setup XHR
      const xhr = new XMLHttpRequest();
      xhrRefs.current[uploadId] = xhr;
      
      const startTime = Date.now();
      let lastProgress = 0;

      // Watchdog Timer
      const resetWatchdog = () => {
        if (watchdogRefs.current[uploadId]) clearTimeout(watchdogRefs.current[uploadId]);
        watchdogRefs.current[uploadId] = setTimeout(() => {
          console.error(`[UploadManager] Upload ${uploadId} stalled.`);
          if (xhr.readyState !== 4) {
            xhr.abort();
            handleError(new Error('Upload stalled: No progress for 60 seconds'));
          }
        }, STALL_TIMEOUT);
      };

      const handleError = (error) => {
        console.error(`[UploadManager] Error in ${uploadId}:`, error);
        if (watchdogRefs.current[uploadId]) clearTimeout(watchdogRefs.current[uploadId]);

        if (error.message === 'Cancelled') {
           updateUploadStatus(uploadId, { status: 'cancelled', progress: 0 });
           cleanup(uploadId);
           return;
        }

        if (retryCount < MAX_RETRIES) {
          console.log(`[UploadManager] Retrying ${uploadId} in 3s...`);
          updateUploadStatus(uploadId, { status: 'retrying', error: `Network error. Retrying (${retryCount + 1}/${MAX_RETRIES})...` });
          
          setTimeout(() => {
            processUpload(uploadId, file, path, projectId, thumbnailBlob, retryCount + 1);
          }, 3000);
          // Do NOT cleanup active count here, we are holding the slot
        } else {
          updateUploadStatus(uploadId, { status: 'error', progress: 0, error: error.message || 'Upload failed after retries' });
          cleanup(uploadId);
          toast({ variant: "destructive", title: "Upload Failed", description: file.name });
        }
      };

      resetWatchdog();

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          resetWatchdog();
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          
          // Only update state if meaningful change to reduce renders
          if (percentComplete > lastProgress || percentComplete === 0 || percentComplete === 100) {
            const timeElapsed = (Date.now() - startTime) / 1000;
            const speed = timeElapsed > 0 ? event.loaded / timeElapsed : 0;
            const remainingBytes = event.total - event.loaded;
            const eta = speed > 0 ? remainingBytes / speed : 0;

            updateUploadStatus(uploadId, {
              progress: percentComplete,
              speed,
              eta,
              // If 100%, show "Processing" instead of just stuck
              status: percentComplete === 100 ? 'finalizing' : 'uploading'
            });
            lastProgress = percentComplete;
          }
        }
      };

      xhr.onload = async () => {
        if (watchdogRefs.current[uploadId]) clearTimeout(watchdogRefs.current[uploadId]);

        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            console.log(`[UploadManager] XHR Success for ${uploadId}. Finalizing DB record...`);
            
            // Get Public URL
            const { data: publicUrlData } = supabase.storage
              .from('project-media')
              .getPublicUrl(path);

            const imageJob = imageJobsRef.current[uploadId];
            let mediaError = null;

            if (imageJob) {
              const geo = await imageJob.geoPromise;
              const latitude = imageJob.processed.metadata.latitude ?? geo?.latitude ?? null;
              const longitude = imageJob.processed.metadata.longitude ?? geo?.longitude ?? null;
              const urls = {
                file_url: publicUrlData.publicUrl,
                web_url: supabase.storage.from('project-media').getPublicUrl(imageJob.paths.web).data.publicUrl,
                thumbnail_url: supabase.storage.from('project-media').getPublicUrl(imageJob.paths.thumbnail).data.publicUrl,
              };
              const inserted = await supabase
                .from('media')
                .insert(
                  buildImageMediaInsert({
                    projectId,
                    userId: user.id,
                    urls,
                    processed: imageJob.processed,
                    description: imageJob.options.description || '',
                    latitude,
                    longitude,
                    capturedAt: imageJob.options.capturedAt || null,
                    showInPortfolio: false,
                  })
                )
                .select('id')
                .single();
              mediaError = inserted.error;
              if (!mediaError && inserted.data?.id) {
                await attachTagNames(inserted.data.id, imageJob.options.tagNames || []);
              }
            } else {
              let finalThumbUrl = thumbnailUrl;
              const inserted = await supabase
                .from('media')
                .insert({
                  project_id: projectId,
                  uploaded_by: user.id,
                  file_url: publicUrlData.publicUrl,
                  file_type: 'video',
                  thumbnail_url: finalThumbUrl,
                  show_in_portfolio: false,
                });
              mediaError = inserted.error;
            }

            if (mediaError) throw mediaError;

            updateUploadStatus(uploadId, { status: 'completed', progress: 100 });
            console.log(`[UploadManager] ${file.name} completed successfully.`);
            
          } catch (err) {
            handleError(err);
            return;
          }
          cleanup(uploadId);
        } else {
          handleError(new Error(`Server responded with ${xhr.status}`));
        }
      };

      xhr.onerror = () => handleError(new Error('Network connection failed'));
      xhr.ontimeout = () => handleError(new Error('Connection timed out'));
      
      xhr.onabort = () => {
         console.log(`[UploadManager] Upload ${uploadId} aborted by user.`);
         if (uploads[uploadId]?.status !== 'cancelled') {
             updateUploadStatus(uploadId, { status: 'cancelled' });
             cleanup(uploadId);
         }
      };

      const imageJob = imageJobsRef.current[uploadId];
      xhr.open('PUT', signedData.signedUrl);
      xhr.setRequestHeader('Content-Type', imageJob?.processed.contentType || file.type || 'application/octet-stream');
      xhr.send(file);

    } catch (error) {
      console.error(`[UploadManager] Critical error in setup for ${uploadId}:`, error);
      updateUploadStatus(uploadId, { status: 'error', error: error.message });
      cleanup(uploadId);
    }
  };

  const cleanup = (uploadId) => {
    delete xhrRefs.current[uploadId];
    delete imageJobsRef.current[uploadId];
    if (watchdogRefs.current[uploadId]) {
        clearTimeout(watchdogRefs.current[uploadId]);
        delete watchdogRefs.current[uploadId];
    }
    setActiveCount(prev => Math.max(0, prev - 1));
  };

  const cancelUpload = (uploadId) => {
    console.log(`[UploadManager] User requested cancel for ${uploadId}`);
    if (xhrRefs.current[uploadId]) {
      xhrRefs.current[uploadId].abort();
    } else {
      setQueue(prev => prev.filter(id => id !== uploadId));
      updateUploadStatus(uploadId, { status: 'cancelled', progress: 0 });
    }
  };

  const removeUpload = (uploadId) => {
    setUploads(prev => {
      const newState = { ...prev };
      delete newState[uploadId];
      return newState;
    });
  };

  const clearCompleted = () => {
    setUploads(prev => {
      const newState = { ...prev };
      Object.keys(newState).forEach(key => {
        if (newState[key].status === 'completed' || newState[key].status === 'cancelled') {
          delete newState[key];
        }
      });
      return newState;
    });
  };

  return (
    <UploadContext.Provider value={{ 
      uploads, 
      addUpload, 
      cancelUpload, 
      removeUpload, 
      clearCompleted,
      isExpanded,
      setIsExpanded
    }}>
      {children}
    </UploadContext.Provider>
  );
};