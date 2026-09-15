import React, { useState, useRef, useEffect } from 'react';
import { Loader2, MapPin, Search, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import useAddressSearch from '@/hooks/useAddressSearch';

/**
 * A search input component that integrates with the OpenStreetMap Nominatim API.
 * Displays a list of address suggestions as the user types.
 * 
 * @param {Object} props
 * @param {function} props.onSelect - Callback fired when an address is selected. format: (addressObject) => void
 * @param {string} [props.placeholder] - Input placeholder text
 * @param {string} [props.className] - Additional CSS classes
 * @param {string} [props.defaultValue] - Initial value for the input
 * @param {boolean} [props.disabled] - Whether the input is disabled
 */
const AddressSearchInput = ({ 
  onSelect, 
  placeholder = "Search for an address...", 
  className,
  defaultValue = "",
  disabled = false
}) => {
  const { 
    query, 
    suggestions, 
    loading, 
    error, 
    searchAddress, 
    selectAddress,
    setQuery 
  } = useAddressSearch();

  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);

  // Initialize with default value if provided
  useEffect(() => {
    if (defaultValue) {
      setQuery(defaultValue);
    }
  }, [defaultValue, setQuery]);

  // Handle click outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Open dropdown when suggestions exist
  useEffect(() => {
    if (suggestions.length > 0) {
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  }, [suggestions]);

  const handleInputChange = (e) => {
    searchAddress(e.target.value);
  };

  const handleSelect = (item) => {
    selectAddress(item);
    setIsOpen(false);
    if (onSelect) {
      onSelect(item);
    }
  };

  const handleInputFocus = () => {
    if (suggestions.length > 0) {
      setIsOpen(true);
    }
  };

  return (
    <div ref={wrapperRef} className={cn("relative w-full", className)}>
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10 pointer-events-none">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
        </div>
        
        <Input
          ref={inputRef}
          value={query}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          placeholder={placeholder}
          disabled={disabled}
          className="pl-9"
          aria-label="Search address"
          aria-expanded={isOpen}
          role="combobox"
          aria-controls="address-listbox"
        />
      </div>

      {error && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-red-500 pointer-events-none group">
          <AlertCircle className="h-4 w-4" />
        </div>
      )}

      {isOpen && !disabled && (
        <div 
          className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-60 overflow-y-auto"
          role="listbox"
          id="address-listbox"
        >
          {suggestions.map((item, index) => (
            <button
              key={index}
              onClick={() => handleSelect(item)}
              className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 focus:bg-gray-100 dark:focus:bg-gray-700 focus:outline-none transition-colors flex items-start gap-2"
              role="option"
            >
              <MapPin className="h-4 w-4 mt-0.5 text-gray-400 shrink-0" />
              <span className="line-clamp-2">{item.display_name}</span>
            </button>
          ))}
          <div className="px-2 py-1 text-[10px] text-gray-400 text-right border-t dark:border-gray-700">
            Search via OpenStreetMap
          </div>
        </div>
      )}
      
      {error && (
         <p className="text-xs text-red-500 mt-1">{error}</p>
      )}
    </div>
  );
};

export default AddressSearchInput;