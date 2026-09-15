import React from 'react';
import { Button } from '@/components/ui/button';
import { Play, Pause, Square, AlertTriangle, CheckCircle2 } from 'lucide-react';

const UploadControls = ({ 
  status, 
  onStart, 
  onPause, 
  onResume, 
  onCancel,
  disabled = false 
}) => {
  const isUploading = status === 'uploading';
  const isPaused = status === 'paused';
  const isCompleted = status === 'completed';
  const isError = status === 'error';
  const isIdle = status === 'idle';

  return (
    <div className="flex items-center gap-3">
      {/* Primary Action Button */}
      {isIdle && (
        <Button 
          onClick={onStart} 
          disabled={disabled}
          className="bg-blue-600 hover:bg-blue-700 text-white min-w-[120px]"
        >
          <Play className="w-4 h-4 mr-2" /> Start Upload
        </Button>
      )}

      {isUploading && (
        <Button 
          onClick={onPause} 
          variant="secondary"
          className="min-w-[120px]"
        >
          <Pause className="w-4 h-4 mr-2" /> Pause
        </Button>
      )}

      {(isPaused || isError) && !isCompleted && (
        <Button 
          onClick={onResume} 
          className="bg-green-600 hover:bg-green-700 text-white min-w-[120px]"
        >
          <Play className="w-4 h-4 mr-2" /> Resume
        </Button>
      )}

      {/* Cancel Button - always available unless completed or idle */}
      {!isIdle && !isCompleted && (
        <Button 
          onClick={onCancel} 
          variant="destructive"
          className="bg-red-100 text-red-600 hover:bg-red-200 hover:text-red-700 border-none"
        >
          <Square className="w-4 h-4 mr-2 fill-current" /> Cancel
        </Button>
      )}

      {/* Status Messages */}
      <div className="ml-auto text-sm font-medium">
        {isUploading && <span className="text-blue-600 animate-pulse">Uploading...</span>}
        {isPaused && <span className="text-orange-500 flex items-center gap-1"><Pause className="w-3 h-3"/> Paused</span>}
        {isCompleted && <span className="text-green-600 flex items-center gap-1"><CheckCircle2 className="w-4 h-4"/> Upload Complete</span>}
        {isError && <span className="text-red-500 flex items-center gap-1"><AlertTriangle className="w-4 h-4"/> Error Interrupted</span>}
      </div>
    </div>
  );
};

export default UploadControls;