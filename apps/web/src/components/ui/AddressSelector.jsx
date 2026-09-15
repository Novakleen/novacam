import React, { useState, useEffect } from 'react';
import { MapPin, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AddressSearchInput from '@/components/ui/AddressSearchInput';
import { cn } from '@/lib/utils';
import { extractCoordinates, formatNominatimAddress } from '@/lib/addressUtils';

/**
 * A comprehensive address selector component.
 * Allows searching for an address or displaying a currently selected one.
 * 
 * @param {Object} props
 * @param {Object|string} props.value - The current address value. Can be a string (legacy) or an object with details.
 * @param {function} props.onAddressSelect - Callback when address is selected/cleared. Returns object or null.
 * @param {string} [props.placeholder] - Placeholder for the search input.
 * @param {string} [props.className] - CSS classes.
 * @param {boolean} [props.disabled] - Disabled state.
 */
const AddressSelector = ({ 
  value, 
  onAddressSelect, 
  placeholder, 
  className,
  disabled 
}) => {
  const [selectedDisplay, setSelectedDisplay] = useState(null);
  const [mode, setMode] = useState('search'); // 'search' or 'selected'

  useEffect(() => {
    // If we have a value, we should be in 'selected' mode
    if (value) {
      setMode('selected');
      if (typeof value === 'string') {
        setSelectedDisplay({ formattedAddress: value });
      } else if (typeof value === 'object') {
        setSelectedDisplay({
          formattedAddress: value.display_name || value.formattedAddress || value.address || '',
          lat: value.lat || value.latitude,
          lng: value.lon || value.lng || value.longitude
        });
      }
    } else {
      setMode('search');
      setSelectedDisplay(null);
    }
  }, [value]);

  const handleSelect = (nominatimResult) => {
    const coords = extractCoordinates(nominatimResult);
    const formatted = formatNominatimAddress(nominatimResult);
    
    const resultObj = {
      ...nominatimResult,
      formattedAddress: formatted,
      latitude: coords?.lat,
      longitude: coords?.lng,
      full_address: formatted // Ensure compatibility with existing backend expectations
    };

    setSelectedDisplay(resultObj);
    setMode('selected');
    
    if (onAddressSelect) {
      onAddressSelect(resultObj);
    }
  };

  const handleClear = () => {
    setSelectedDisplay(null);
    setMode('search');
    if (onAddressSelect) {
      onAddressSelect(null);
    }
  };

  if (mode === 'selected' && selectedDisplay) {
    return (
      <div className={cn("relative w-full p-3 border rounded-xl bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800", className)}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 overflow-hidden">
            <div className="mt-1 bg-green-100 dark:bg-green-900 p-1 rounded-full text-green-600 dark:text-green-400 shrink-0">
               <Check className="h-3 w-3" />
            </div>
            <div className="min-w-0">
               <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate pr-2">
                 {selectedDisplay.formattedAddress}
               </p>
               {(selectedDisplay.lat || selectedDisplay.latitude) && (
                 <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                   <MapPin className="h-3 w-3" />
                   {parseFloat(selectedDisplay.lat || selectedDisplay.latitude).toFixed(5)}, {parseFloat(selectedDisplay.lng || selectedDisplay.longitude).toFixed(5)}
                 </p>
               )}
            </div>
          </div>
          
          <Button 
            type="button" 
            variant="ghost" 
            size="sm" 
            onClick={handleClear}
            disabled={disabled}
            className="h-8 w-8 p-0 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20"
            title="Clear address"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <AddressSearchInput 
      onSelect={handleSelect}
      placeholder={placeholder}
      className={className}
      disabled={disabled}
    />
  );
};

export default AddressSelector;