import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ArrowRight, RotateCcw, Plus, Image as ImageIcon } from 'lucide-react';

const PhotoDescriptionForm = ({ photo, onSave, onRetake, onAddAnother, index, total, allowAddAnother = true }) => {
  const [description, setDescription] = useState(photo.description || '');

  const handleNext = () => {
    onSave(description);
  };

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-gray-900 flex flex-col">
      <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-1">
            <h2 className="text-2xl font-bold tracking-tight">Add Details</h2>
            {total > 1 && <p className="text-gray-500">Photo {index + 1} of {total}</p>}
          </div>

          <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800 shadow-xl bg-gray-100 dark:bg-black/50 aspect-[4/3] relative">
            <img 
              src={photo.annotatedDataUrl} 
              alt="Captured" 
              className="w-full h-full object-contain"
            />
          </div>

          <div className="space-y-2">
             <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
               Notes & Description
             </label>
             <div className="relative">
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, 500))}
                  placeholder="Describe what this photo shows (e.g., 'Broken pipe under sink')..."
                  className="min-h-[120px] resize-none text-base pr-4 pb-6"
                />
                <div className="absolute bottom-2 right-2 text-xs text-gray-400">
                  {description.length}/500
                </div>
             </div>
          </div>
        </div>
      </div>

      <div className="p-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 flex flex-col gap-3">
         <Button 
            onClick={handleNext} 
            className="w-full bg-blue-600 hover:bg-blue-700 text-white h-12 text-lg font-semibold shadow-lg shadow-blue-500/20"
         >
           Review & Upload <ArrowRight className="ml-2 h-5 w-5" />
         </Button>

         <div className="grid grid-cols-2 gap-3">
             {allowAddAnother ? (
               <Button variant="outline" onClick={onAddAnother} className="h-11">
                  <Plus className="mr-2 h-4 w-4" /> Add Another
               </Button>
             ) : (
                <div /> // Spacer if button is hidden, or use col-span-2 for retake
             )}
             
             <Button 
                variant="ghost" 
                onClick={onRetake} 
                className={`text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 h-11 ${!allowAddAnother ? 'col-span-2 w-full border border-red-200 dark:border-red-900/30' : ''}`}
             >
                <RotateCcw className="mr-2 h-4 w-4" /> Retake Photo
             </Button>
         </div>
      </div>
    </div>
  );
};

export default PhotoDescriptionForm;