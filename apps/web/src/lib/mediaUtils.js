/**
 * Media processing utilities for client-side compression and thumbnail generation
 */

export const COMPRESSION_SETTINGS = {
  HIGH: { quality: 0.8, maxWidth: 1920, maxHeight: 1080 },
  MEDIUM: { quality: 0.6, maxWidth: 1280, maxHeight: 720 },
  LOW: { quality: 0.4, maxWidth: 800, maxHeight: 600 }
};

// Worker instance singleton
let compressionWorker = null;
const pendingCallbacks = new Map();

const getWorker = () => {
  if (!compressionWorker) {
    compressionWorker = new Worker(new URL('./compression.worker.js', import.meta.url), {
      type: 'module'
    });
    
    compressionWorker.onmessage = (e) => {
      const { id, success, blob, file, error, name, type } = e.data;
      const callback = pendingCallbacks.get(id);
      
      if (callback) {
        if (success) {
          if (blob) {
            // Reconstruct File object from Blob
            const newFile = new File([blob], name, { type, lastModified: Date.now() });
            callback.resolve(newFile);
          } else {
            callback.resolve(file);
          }
        } else {
          console.warn('Compression failed, using original:', error);
          callback.resolve(file); // Fallback to original
        }
        pendingCallbacks.delete(id);
      }
    };
  }
  return compressionWorker;
};

export const compressImage = async (file, level = 'HIGH') => {
  return new Promise((resolve, reject) => {
    try {
      if (!file.type.startsWith('image/')) {
        resolve(file);
        return;
      }

      const id = Math.random().toString(36).substring(7);
      pendingCallbacks.set(id, { resolve, reject });
      
      const worker = getWorker();
      worker.postMessage({ file, settings: level, id });

    } catch (error) {
      console.error("Compression setup failed", error);
      resolve(file);
    }
  });
};

export const getVideoDuration = async (file) => {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('video/')) {
      resolve(0);
      return;
    }

    const video = document.createElement('video');
    video.preload = 'metadata';
    const url = URL.createObjectURL(file);
    video.src = url;

    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(video.duration);
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load video metadata'));
    };
  });
};

export const generateVideoThumbnail = async (file) => {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('video/')) {
      resolve(null);
      return;
    }

    const video = document.createElement('video');
    video.preload = 'metadata';
    video.playsInline = true;
    video.muted = true;
    
    const url = URL.createObjectURL(file);
    video.src = url;

    // Wait for metadata to load to get dimensions
    video.onloadeddata = () => {
      // Seek to 1 second or 25% if shorter to capture meaningful content
      video.currentTime = Math.min(1, video.duration * 0.25);
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        // Limit thumbnail size
        const maxWidth = 640;
        const scale = Math.min(1, maxWidth / video.videoWidth);
        
        canvas.width = video.videoWidth * scale;
        canvas.height = video.videoHeight * scale;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(url);
          if (blob) {
            resolve({ blob, duration: video.duration, width: video.videoWidth, height: video.videoHeight });
          } else {
            reject(new Error('Thumbnail generation failed'));
          }
        }, 'image/jpeg', 0.75);
      } catch (error) {
        URL.revokeObjectURL(url);
        reject(error);
      }
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Video loading failed'));
    };
  });
};

export const processVideo = async (file, resolution, onProgress) => {
  return new Promise((resolve) => {
    if (!file.type.startsWith('video/')) {
      resolve(file);
      return;
    }

    // Simulation of video processing since we can't do heavy transcoding in browser easily without ffmpeg.wasm
    let progress = 0;
    const interval = setInterval(() => {
      progress += 20;
      if (onProgress) onProgress(progress);
      
      if (progress >= 100) {
        clearInterval(interval);
        resolve(file); 
      }
    }, 100);
  });
};