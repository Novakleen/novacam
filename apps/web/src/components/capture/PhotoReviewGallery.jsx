import React from 'react';
import { Trash2, Plus, Upload, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

const PhotoReviewGallery = ({ photos, onDelete, onAddMore, onUpload, uploading, allowAddMore = true }) => {
  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-gray-950 flex flex-col">
       <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm">
          <div>
            <h2 className="text-xl font-bold">Review Photo</h2>
            <p className="text-sm text-gray-500">{photos.length} photo ready to upload</p>
          </div>
          {allowAddMore && (
            <Button variant="outline" size="sm" onClick={onAddMore} disabled={uploading}>
               <Plus className="mr-2 h-4 w-4" /> Add More
            </Button>
          )}
       </div>

       <ScrollArea className="flex-1 p-4 bg-gray-50 dark:bg-gray-900/50">
          <div className="grid grid-cols-1 gap-4 pb-20 max-w-md mx-auto">
             {photos.map((photo, index) => (
                <div key={photo.id} className="bg-white dark:bg-gray-800 rounded-xl overflow-hidden shadow-sm border border-gray-200 dark:border-gray-700 group relative">
                   <div className="aspect-[4/3] bg-gray-100 dark:bg-gray-900 relative">
                      <img src={photo.annotatedDataUrl} alt="" className="w-full h-full object-contain" />
                      <button 
                        onClick={() => onDelete(index)}
                        className="absolute top-2 right-2 bg-black/50 hover:bg-red-500 text-white p-1.5 rounded-full backdrop-blur-sm transition-colors opacity-0 group-hover:opacity-100"
                        disabled={uploading}
                      >
                         <Trash2 className="h-4 w-4" />
                      </button>
                   </div>
                   <div className="p-3">
                      <p className="text-sm text-gray-600 dark:text-gray-300 min-h-[2.5rem]">
                        {photo.description || <span className="italic text-gray-400">No description</span>}
                      </p>
                   </div>
                </div>
             ))}
             
             {allowAddMore && (
                 <button 
                   onClick={onAddMore}
                   disabled={uploading}
                   className="aspect-square rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-700 flex flex-col items-center justify-center text-gray-400 hover:border-blue-500 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors"
                 >
                    <Plus className="h-8 w-8 mb-2" />
                    <span className="text-sm font-medium">Add Photo</span>
                 </button>
             )}
          </div>
       </ScrollArea>

       <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
          <Button 
            onClick={onUpload} 
            disabled={uploading || photos.length === 0}
            className="w-full h-12 text-lg bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-500/20"
          >
             {uploading ? (
               'Uploading...'
             ) : (
               <>
                 Confirm Upload <Upload className="ml-2 h-5 w-5" />
               </>
             )}
          </Button>
       </div>
    </div>
  );
};

export default PhotoReviewGallery;