import React, { useState } from 'react';
import { Save, ArrowLeft, ArrowRightLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';

const BeforeAfterPreview = ({ beforePhoto, afterPhoto, onSave, onCancel, isSaving }) => {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [name, setName] = useState('');

  const handleSave = () => {
    onSave({ name: name || 'Before & After Comparison' });
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onCancel}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h3 className="font-semibold text-lg">Preview Comparison</h3>
        </div>
        <Button onClick={handleSave} disabled={isSaving || !beforePhoto || !afterPhoto}>
          {isSaving ? 'Saving...' : 'Save Comparison'}
          {!isSaving && <Save className="ml-2 h-4 w-4" />}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
        
        {/* Interactive Comparison View */}
        <div className="relative w-full aspect-[4/3] max-w-3xl mx-auto rounded-xl overflow-hidden shadow-2xl border border-gray-200 dark:border-gray-700 select-none">
          {/* After Photo (Bottom Layer) */}
          <div className="absolute inset-0">
            <img 
              src={afterPhoto?.file_url || afterPhoto?.dataUrl} 
              alt="After" 
              className="w-full h-full object-cover"
            />
            <div className="absolute top-4 right-4 bg-black/60 text-white text-xs font-bold px-2 py-1 rounded">
              AFTER
            </div>
          </div>

          {/* Before Photo (Top Layer - Clipped) */}
          <div 
            className="absolute inset-0 overflow-hidden border-r-2 border-white"
            style={{ width: `${sliderPosition}%` }}
          >
            <img 
              src={beforePhoto?.file_url || beforePhoto?.dataUrl} 
              alt="Before" 
              className="w-full h-full object-cover"
              style={{ 
                 // Important: Counteract the container width to keep image static
                 width: `${10000 / sliderPosition}%`, 
                 maxWidth: 'none',
                 height: '100%'
              }} 
            />
            <div className="absolute top-4 left-4 bg-black/60 text-white text-xs font-bold px-2 py-1 rounded">
              BEFORE
            </div>
          </div>

          {/* Slider Handle */}
          <div 
            className="absolute inset-y-0 w-1 bg-white cursor-ew-resize flex items-center justify-center shadow-lg"
            style={{ left: `${sliderPosition}%` }}
          >
            <div className="w-8 h-8 -ml-3.5 bg-white rounded-full flex items-center justify-center shadow-md">
              <ArrowRightLeft className="w-4 h-4 text-gray-600" />
            </div>
          </div>
          
          {/* Interaction Area for Slider */}
          <input
            type="range"
            min="0"
            max="100"
            value={sliderPosition}
            onChange={(e) => setSliderPosition(e.target.value)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-10"
          />
        </div>

        <div className="max-w-md mx-auto space-y-4">
           <div className="space-y-2">
             <Label htmlFor="comp-name">Comparison Name</Label>
             <Input 
               id="comp-name"
               placeholder="e.g. Kitchen Renovation"
               value={name}
               onChange={(e) => setName(e.target.value)}
             />
           </div>
           
           <div className="text-center text-sm text-gray-500">
             Drag the slider to test the comparison effect. This is how it will be displayed in the project gallery.
           </div>
        </div>
      </div>
    </div>
  );
};

export default BeforeAfterPreview;