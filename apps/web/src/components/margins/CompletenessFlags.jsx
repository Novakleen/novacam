import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

const CompletenessFlags = ({ flags = [], className }) => {
  if (!flags.length) return null;
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {flags.map((f) => (
        <span
          key={f.key}
          className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-800 px-2 py-0.5 text-[11px] font-medium"
        >
          <AlertTriangle className="h-3 w-3 shrink-0" />
          {f.label}
        </span>
      ))}
    </div>
  );
};

export default CompletenessFlags;
