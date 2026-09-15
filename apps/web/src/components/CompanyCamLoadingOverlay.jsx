import React from 'react';
import { Loader2 } from 'lucide-react';

export const CompanyCamLoadingOverlay = ({ visible, message = "Loading CompanyCam Data..." }) => {
  if (!visible) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/60 dark:bg-gray-900/60 backdrop-blur-sm rounded-xl">
      <div className="flex flex-col items-center p-6 bg-white dark:bg-gray-800 shadow-2xl rounded-2xl border border-gray-100 dark:border-gray-700">
        <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
        <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{message}</p>
      </div>
    </div>
  );
};

export default CompanyCamLoadingOverlay;