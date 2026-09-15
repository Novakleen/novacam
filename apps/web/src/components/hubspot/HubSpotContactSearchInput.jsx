import React, { useEffect, useState } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const HubSpotContactSearchInput = ({ 
  value, 
  onChange, 
  loading, 
  placeholder = "Search HubSpot contacts...",
  className
}) => {
  const [inputValue, setInputValue] = useState(value);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    const timer = setTimeout(() => {
      // Only fire change if value actually changed
      // Allow searching for even 1 char to debug, but practically useful 2+
      // We'll relax the restriction slightly to ensure nothing is blocked by frontend prematurely
      if (inputValue !== value) {
         onChange(inputValue);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [inputValue, onChange, value]);

  const handleClear = () => {
    setInputValue('');
    onChange('');
  };

  return (
    <div className={`relative ${className}`}>
      <Search className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${loading ? 'text-primary' : 'text-muted-foreground'} transition-colors`} />
      <Input
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        placeholder={loading ? "Searching..." : placeholder}
        className="pl-9 pr-10"
      />
      
      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
        {loading && (
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        )}
        {inputValue && !loading && (
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-6 w-6 hover:bg-transparent"
            onClick={handleClear}
          >
            <X className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors" />
          </Button>
        )}
      </div>
    </div>
  );
};

export default HubSpotContactSearchInput;