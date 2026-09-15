/* eslint-disable no-restricted-globals */
/**
 * Web Worker for off-main-thread image compression
 */

const COMPRESSION_SETTINGS = {
  HIGH: { quality: 0.8, maxWidth: 1920, maxHeight: 1080 },
  MEDIUM: { quality: 0.6, maxWidth: 1280, maxHeight: 720 },
  LOW: { quality: 0.4, maxWidth: 800, maxHeight: 600 }
};

self.onmessage = async (e) => {
  const { file, settings: settingsLevel, id } = e.data;

  try {
    if (!file.type.startsWith('image/')) {
      self.postMessage({ id, success: true, file });
      return;
    }

    const settings = COMPRESSION_SETTINGS[settingsLevel] || COMPRESSION_SETTINGS.HIGH;
    const bitmap = await createImageBitmap(file);
    
    // Calculate dimensions
    let width = bitmap.width;
    let height = bitmap.height;
    
    if (width > settings.maxWidth || height > settings.maxHeight) {
      const ratio = Math.min(settings.maxWidth / width, settings.maxHeight / height);
      width = Math.floor(width * ratio);
      height = Math.floor(height * ratio);
    }

    // Create OffscreenCanvas
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, width, height);

    // Convert to Blob
    const blob = await canvas.convertToBlob({
      type: 'image/webp',
      quality: settings.quality
    });

    // Cleanup
    bitmap.close();

    // Check if compression helped
    if (blob.size < file.size) {
      // Send back as a File-like object (metadata + blob)
      self.postMessage({ 
        id, 
        success: true, 
        blob, 
        isCompressed: true,
        name: file.name.replace(/\.[^/.]+$/, ".webp"),
        type: 'image/webp'
      });
    } else {
      self.postMessage({ id, success: true, file, isCompressed: false });
    }

  } catch (error) {
    console.error('Worker compression error:', error);
    // Fallback to original file on error
    self.postMessage({ id, success: false, error: error.message, file });
  }
};