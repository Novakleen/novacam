import React, { useState } from 'react';
import { ArrowRightLeft, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const BeforeAfterComparison = ({ comparison, onDelete, className }) => {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isHovered, setIsHovered] = useState(false);

  if (!comparison || !comparison.before_photo || !comparison.after_photo) {
      return (
          <div className="p-4 border border-red-200 bg-red-50 text-red-600 rounded-lg text-sm">
              Error: Invalid comparison data
          </div>
      );
  }

  // Handle Supabase join structure where photo data might be nested
  const beforeUrl = comparison.before_photo?.file_url;
  const afterUrl = comparison.after_photo?.file_url;

  if (!beforeUrl || !afterUrl) {
    return null; // Skip rendering if urls missing
  }

  return (
    <div 
      className={cn("group relative bg-white dark:bg-gray-800 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 shadow-sm", className)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Header */}
      <div className="p-3 flex items-center justify-between border-b border-gray-100 dark:border-gray-800">
        <span className="font-medium text-sm truncate pr-2">{comparison.comparison_name}</span>
        {onDelete && (
           <Button 
             variant="ghost" 
             size="icon" 
             className="h-6 w-6 text-gray-400 hover:text-red-500"
             onClick={() => onDelete(comparison.id)}
           >
             <Trash2 className="h-3.5 w-3.5" />
           </Button>
        )}
      </div>

      {/* Comparison View */}
      <div className="relative aspect-[4/3] w-full overflow-hidden select-none">
          {/* After Photo (Bottom) */}
          <div className="absolute inset-0">
             <img src={afterUrl} alt="After" className="w-full h-full object-cover" />
             <div className="absolute bottom-2 right-2 bg-black/50 text-white text-[10px] font-bold px-1.5 py-0.5 rounded backdrop-blur-sm">
                AFTER
             </div>
          </div>

          {/* Before Photo (Top - Clipped) */}
          <div 
            className="absolute inset-0 overflow-hidden border-r-2 border-white shadow-xl"
            style={{ width: `${sliderPosition}%` }}
          >
             <img 
               src={beforeUrl} 
               alt="Before" 
               className="w-full h-full object-cover max-w-none"
               style={{ width: `${100 / (sliderPosition / 100)}%`, height: '100%' }}
             />
             <div className="absolute top-2 left-2 bg-black/50 text-white text-[10px] font-bold px-1.5 py-0.5 rounded backdrop-blur-sm">
                BEFORE
             </div>
          </div>

          {/* Slider Handle */}
          <div 
            className="absolute inset-y-0 w-0.5 bg-white cursor-ew-resize flex items-center justify-center"
            style={{ left: `${sliderPosition}%` }}
          >
             <div className="w-6 h-6 -ml-3 bg-white rounded-full flex items-center justify-center shadow-md">
               <ArrowRightLeft className="w-3 h-3 text-gray-600" />
             </div>
          </div>

          {/* Interactive Range Input */}
          <input
            type="range"
            min="0"
            max="100"
            value={sliderPosition}
            onChange={(e) => setSliderPosition(e.target.value)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-10"
            aria-label="Comparison slider"
          />
      </div>
    </div>
  );
};

export default BeforeAfterComparison;