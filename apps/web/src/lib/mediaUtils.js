/**
 * Media helpers. Photo bytes go through processImageFile (long edge, EXIF, three sizes).
 * compressImage remains for callers that only need the original-sized file.
 */

import { isImageFile } from '@/lib/imageSizes';
import { processImageFile } from '@/lib/processImage';

export const compressImage = async (file) => {
  try {
    if (!isImageFile(file)) return file;
    const processed = await processImageFile(file);
    return processed.original;
  } catch (error) {
    console.warn('Compression failed, using original', error);
    return file;
  }
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