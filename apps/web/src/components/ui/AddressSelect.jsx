import React from 'react';
import { MapPin } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

const AddressSelect = ({ 
  value, 
  onChange, 
  placeholder = "Select an address...", 
  className,
  addressOptions = [],
  error,
  disabled
}) => {
  return (
    <div className="relative w-full">
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10 pointer-events-none">
          <MapPin className="h-4 w-4" />
        </div>
        
        <Select 
          value={value} 
          onValueChange={onChange} 
          disabled={disabled}
        >
          <SelectTrigger className={cn("pl-9", className, error && "border-red-500 ring-red-500")}>
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {addressOptions.length > 0 ? (
              addressOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))
            ) : (
              <div className="p-2 text-sm text-gray-500 text-center">No options available</div>
            )}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <p className="text-xs text-red-500 mt-1.5 font-medium">
          {error}
        </p>
      )}
    </div>
  );
};

export default AddressSelect;