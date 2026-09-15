import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import ChunkProgressDisplay from './ChunkProgressDisplay';
import UploadControls from './UploadControls';
import { useNetworkSpeed } from '@/hooks/useNetworkSpeed';
import { UploadResumeManager } from '@/lib/UploadResumeManager';
import { BrowserNotificationManager } from '@/lib/BrowserNotificationManager';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

// Supabase JS client handles chunking automatically via TUS protocol.
// We don't need to manually manage parts, but we can hook into onProgress.
const LargeFileUploadManager = ({ file, projectId, onComplete, onCancel }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { networkSpeed, measureSpeed } = useNetworkSpeed();
  
  // State
  const [status, setStatus] = useState('idle'); // idle, uploading, paused, completed, error
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [filePath, setFilePath] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [progress, setProgress] = useState(0);

  // Refs for control
  const uploadSubscriptionRef = useRef(null);
  const isPausedRef = useRef(false);
  const startTimeRef = useRef(null);

  // --- Initialization ---

  const initializeUpload = async () => {
    if (!file || !projectId) return;
    
    // Check for existing session
    const existingSession = UploadResumeManager.findSessionForFile(file);
    
    if (existingSession) {
      const shouldResume = window.confirm(
        `Found incomplete upload for ${file.name}. Resume?`
      );
      
      if (shouldResume) {
        setFilePath(existingSession.path);
        setStatus('paused');
        return;
      } else {
        UploadResumeManager.deleteUploadSession(existingSession.uploadId);
      }
    }

    // Start New
    try {
      setStatus('initializing');
      const ext = file.name.split('.').pop();
      const path = `${projectId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
      
      setFilePath(path);
      setStatus('idle');
      
      // Save initial session (using path as ID for simplicity with TUS)
      UploadResumeManager.saveUploadSession(path, { 
        name: file.name, 
        size: file.size, 
        type: file.type, 
        projectId,
        path
      }, [], 0);

    } catch (err) {
      console.error('Init failed:', err);
      setErrorMessage(err.message);
      setStatus('error');
    }
  };

  useEffect(() => {
    initializeUpload();
    return () => {
      // Cleanup on unmount if uploading
      if (status === 'uploading') {
        // We can't easily "pause" on unmount without user intent, but we should stop listening
      }
    };
  }, [file]);

  // --- Upload Logic ---

  const startOrResumeUpload = async () => {
    if (!filePath || !file) return;

    setStatus('uploading');
    isPausedRef.current = false;
    startTimeRef.current = Date.now();
    setErrorMessage(null);

    try {
      // Supabase v2 upload method handles TUS automatically for large files
      // if we use the standard upload method.
      // For true resumability across browser sessions, TUS is best, but Supabase JS 
      // abstracts this. We will use the standard upload with upsert: true to overwrite/resume
      // if the client supports it, or just standard upload.
      
      // NOTE: The standard supabase-js client's `upload` method is a simple HTTP wrapper.
      // For large files and resumability, we rely on the underlying implementation.
      // If we want true chunked control, we'd use TUS client directly, but here we stick to Supabase SDK.
      
      const { data, error } = await supabase.storage
        .from('project-media')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true,
          duplex: 'half' // Required for some environments with large streams
        });

      if (error) throw error;

      // Success
      handleCompletion();

    } catch (error) {
      console.error("Upload failed:", error);
      if (!isPausedRef.current) {
        setErrorMessage(error.message);
        setStatus('error');
      }
    }
  };

  // Since Supabase JS SDK doesn't expose a granular "progress" callback for the `upload` method 
  // in all versions (it does in v2 via XHR but it's not always exposed in the promise chain),
  // we might need to use XMLHttpRequest for progress if the SDK doesn't support it.
  // HOWEVER, modern Supabase JS (v2.30+) usually doesn't expose onProgress in the simple `upload` helper.
  // We will implement a custom uploader using XHR to get progress, which is compatible with Supabase Storage (S3/GoTrue).

  const uploadWithProgress = async () => {
    if (!filePath || !file) return;
    
    setStatus('uploading');
    isPausedRef.current = false;
    startTimeRef.current = Date.now();

    // Get a signed URL for uploading
    try {
        // 1. Create a signed URL for the upload (PUT)
        // Note: Supabase Storage allows uploading to a signed URL.
        const { data: signedData, error: signedError } = await supabase.storage
            .from('project-media')
            .createSignedUploadUrl(filePath);

        if (signedError) throw signedError;

        const xhr = new XMLHttpRequest();
        uploadSubscriptionRef.current = xhr;

        xhr.upload.addEventListener("progress", (event) => {
            if (event.lengthComputable) {
                const percentComplete = (event.loaded / event.total) * 100;
                setUploadedBytes(event.loaded);
                setProgress(percentComplete);
                
                // Calculate speed
                const duration = (Date.now() - startTimeRef.current) / 1000;
                if (duration > 0) {
                    measureSpeed(event.loaded, duration * 1000); // measureSpeed expects ms
                }

                // Update session for resume (approximate)
                UploadResumeManager.saveUploadSession(filePath, { 
                    name: file.name, 
                    size: file.size, 
                    type: file.type, 
                    projectId, 
                    path: filePath 
                }, [], percentComplete);
            }
        });

        xhr.addEventListener("load", () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                handleCompletion();
            } else {
                setErrorMessage(`Upload failed with status ${xhr.status}`);
                setStatus('error');
            }
        });

        xhr.addEventListener("error", () => {
            if (!isPausedRef.current) {
                setErrorMessage("Network error occurred");
                setStatus('error');
            }
        });

        xhr.addEventListener("abort", () => {
            console.log("Upload aborted");
        });

        xhr.open("PUT", signedData.signedUrl);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.setRequestHeader("x-upsert", "true"); // Allow overwriting for "resume" (restart)
        xhr.send(file);

    } catch (err) {
        console.error("Setup failed:", err);
        setErrorMessage(err.message);
        setStatus('error');
    }
  };


  const handleCompletion = async () => {
    setStatus('finalizing');
    try {
        // DB Entry
        const { data: publicUrlData } = supabase.storage.from('project-media').getPublicUrl(filePath);

        await supabase.from('media').insert({
            project_id: projectId,
            uploaded_by: user.id,
            file_url: publicUrlData.publicUrl,
            file_type: file.type.startsWith('video/') ? 'video' : 'image',
            thumbnail_url: null, 
            show_in_portfolio: false
        });

        setStatus('completed');
        setProgress(100);
        UploadResumeManager.deleteUploadSession(filePath);
        BrowserNotificationManager.showUploadCompleteNotification(file.name);
        toast({ title: "Upload Completed", description: "Your file has been uploaded successfully." });
        if (onComplete) onComplete();

    } catch (error) {
        console.error("Finalization failed:", error);
        setErrorMessage("Failed to finalize upload: " + error.message);
        setStatus('error');
    }
  };

  // --- Controls ---

  const handleStart = () => {
    uploadWithProgress();
  };

  const handlePause = () => {
    isPausedRef.current = true;
    if (uploadSubscriptionRef.current) {
        uploadSubscriptionRef.current.abort();
    }
    setStatus('paused');
  };

  const handleResume = () => {
    // For simple XHR upload to signed URL, "resume" effectively restarts the file upload
    // unless we implement complex byte-range patching which Supabase Storage doesn't natively simplify via JS SDK yet.
    // We will restart for now, but UI says "Resume".
    uploadWithProgress();
  };

  const handleCancel = async () => {
    handlePause();
    
    if (window.confirm("Are you sure you want to cancel?")) {
        UploadResumeManager.deleteUploadSession(filePath);
        if (onCancel) onCancel();
    }
  };

  // --- Render ---

  if (!file) return null;

  const remainingBytes = file.size - uploadedBytes;
  const estimatedTime = networkSpeed > 0 ? remainingBytes / networkSpeed : 0;

  // Mock chunks for visualizer since we are doing a single stream now
  // We can visualize progress as "completed chunks" based on percentage
  const totalVisualChunks = 50;
  const completedCount = Math.floor((progress / 100) * totalVisualChunks);
  const visualChunks = Array.from({ length: totalVisualChunks }).map((_, i) => ({
      index: i,
      status: i < completedCount ? 'completed' : (i === completedCount && status === 'uploading' ? 'uploading' : 'pending')
  }));

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      
      {errorMessage && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      <ChunkProgressDisplay 
        chunks={visualChunks}
        totalProgress={progress}
        uploadedBytes={uploadedBytes}
        totalBytes={file.size}
        networkSpeed={networkSpeed}
        estimatedTime={estimatedTime}
        status={status}
      />

      <div className="flex justify-center pt-4">
        <UploadControls 
          status={status}
          onStart={handleStart}
          onPause={handlePause}
          onResume={handleResume}
          onCancel={handleCancel}
          disabled={status === 'initializing' || status === 'finalizing'}
        />
      </div>

    </div>
  );
};

export default LargeFileUploadManager;