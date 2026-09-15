import React from 'react';
import { motion } from 'framer-motion';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { Activity, Wifi, Clock, UploadCloud } from 'lucide-react';

const formatBytes = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatTime = (seconds) => {
  if (!seconds || seconds === Infinity) return '--';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
};

const ChunkProgressDisplay = ({ 
  chunks, 
  totalProgress, 
  uploadedBytes, 
  totalBytes, 
  networkSpeed, 
  estimatedTime,
  status 
}) => {
  return (
    <div className="space-y-6">
      {/* Overall Status Card */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <UploadCloud className="w-5 h-5 text-blue-500" />
            Upload Progress
          </h3>
          <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {Math.round(totalProgress)}%
          </span>
        </div>

        <Progress value={totalProgress} className="h-3 mb-4" />

        <div className="grid grid-cols-3 gap-4 text-sm">
          <div className="flex flex-col gap-1">
            <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1">
              <Activity className="w-3 h-3" /> Size
            </span>
            <span className="font-medium">{formatBytes(uploadedBytes)} / {formatBytes(totalBytes)}</span>
          </div>
          
          <div className="flex flex-col gap-1">
            <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1">
              <Wifi className="w-3 h-3" /> Speed
            </span>
            <span className="font-medium text-green-600 dark:text-green-400">
              {formatBytes(networkSpeed)}/s
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1">
              <Clock className="w-3 h-3" /> Remaining
            </span>
            <span className="font-medium text-orange-600 dark:text-orange-400">
              {formatTime(estimatedTime)}
            </span>
          </div>
        </div>
      </div>

      {/* Chunk Visualizer */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm">
        <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3 uppercase tracking-wider">
          Chunk Map ({chunks.length} parts)
        </h4>
        
        <div className="grid grid-cols-10 sm:grid-cols-12 md:grid-cols-[repeat(auto-fill,minmax(20px,1fr))] gap-1.5">
          {chunks.map((chunk) => (
            <div
              key={chunk.index}
              title={`Part ${chunk.index + 1}: ${chunk.status}`}
              className={cn(
                "aspect-square rounded-sm text-[8px] flex items-center justify-center transition-all duration-300",
                chunk.status === 'pending' && "bg-gray-100 dark:bg-gray-700 text-gray-400",
                chunk.status === 'uploading' && "bg-blue-500 text-white animate-pulse shadow-blue-500/50 shadow-sm z-10 scale-110",
                chunk.status === 'completed' && "bg-green-500 text-white",
                chunk.status === 'failed' && "bg-red-500 text-white animate-pulse",
                chunk.status === 'retrying' && "bg-orange-500 text-white"
              )}
            >
              {chunk.index + 1}
            </div>
          ))}
        </div>
        
        <div className="flex items-center gap-4 mt-4 text-xs text-gray-500">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 bg-gray-200 dark:bg-gray-700 rounded-sm"></div>
            <span>Pending</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 bg-blue-500 rounded-sm"></div>
            <span>Uploading</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 bg-green-500 rounded-sm"></div>
            <span>Done</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 bg-red-500 rounded-sm"></div>
            <span>Failed</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChunkProgressDisplay;