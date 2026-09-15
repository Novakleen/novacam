import React, { useState, useEffect } from 'react';
import { Upload, X, FileVideo, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useVideoUpload } from '@/hooks/useVideoUpload';
import { formatBytes } from '@/lib/utils';

const VideoUploadFlow = ({ file, projectId, userId, onCancel, onSuccess }) => {
  const { uploadVideo, uploading, progress, error, validateVideo } = useVideoUpload(projectId, userId);
  const [isValidating, setIsValidating] = useState(true);
  const [validationError, setValidationError] = useState(null);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const checkFile = async () => {
      setIsValidating(true);
      setValidationError(null);
      try {
        const dur = await validateVideo(file);
        setDuration(dur);
      } catch (err) {
        setValidationError(err.message);
      } finally {
        setIsValidating(false);
      }
    };

    if (file) {
      checkFile();
    }
  }, [file]);

  const handleStartUpload = async () => {
    if (validationError) return;
    const result = await uploadVideo(file);
    if (result) {
      onSuccess?.(result);
    }
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="p-6 space-y-6 max-w-md mx-auto">
      <div className="text-center space-y-2">
        <div className="mx-auto w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
          <FileVideo className="h-6 w-6 text-blue-600 dark:text-blue-400" />
        </div>
        <h3 className="text-lg font-semibold">Upload Video</h3>
        <p className="text-sm text-gray-500 max-w-[280px] mx-auto truncate" title={file.name}>
          {file.name}
        </p>
      </div>

      <div className="space-y-4">
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Size</span>
            <span className="font-medium">{formatBytes(file.size)}</span>
          </div>
          {duration > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-500">Duration</span>
              <span className="font-medium">{formatDuration(duration)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-500">Type</span>
            <span className="uppercase font-medium">{file.type.split('/')[1]}</span>
          </div>
        </div>

        {validationError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Validation Error</AlertTitle>
            <AlertDescription>{validationError}</AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Upload Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {uploading && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Uploading...</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}

        {!uploading && !validationError && isValidating && (
             <div className="text-center text-sm text-gray-500 py-2">Validating file...</div>
        )}
      </div>

      <div className="flex gap-3 pt-2">
        <Button variant="outline" className="flex-1" onClick={onCancel} disabled={uploading}>
          Cancel
        </Button>
        <Button 
          className="flex-1" 
          onClick={handleStartUpload} 
          disabled={!!validationError || uploading || isValidating}
        >
          {uploading ? 'Uploading...' : 'Upload Video'}
        </Button>
      </div>
    </div>
  );
};

export default VideoUploadFlow;