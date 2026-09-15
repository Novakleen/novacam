import React, { useState, useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useHubSpotContacts } from '@/hooks/useHubSpotContacts';
import HubSpotContactSearchInput from './HubSpotContactSearchInput';
import HubSpotContactSearchResults from './HubSpotContactSearchResults';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const HubSpotContactSelector = ({ 
  value, 
  onChange, 
  onContactSelect,
  className,
  placeholder 
}) => {
  const { 
    contacts, 
    loading, 
    error, 
    pagination, 
    rateLimitInfo, 
    fetchHubSpotContacts, 
    loadMore,
    resetRateLimit
  } = useHubSpotContacts();

  const [query, setQuery] = useState('');
  const [selectedContact, setSelectedContact] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // Initial Fetch if no contacts loaded
  useEffect(() => {
    if (contacts.length === 0 && !loading && !error) {
      fetchHubSpotContacts({ query: '' });
    }
  }, []); // Only on mount

  // Sync value if passed from props (controlled component)
  useEffect(() => {
    if (value && contacts.length > 0) {
       const found = contacts.find(c => c.id === value);
       if (found) setSelectedContact(found);
    }
  }, [value, contacts]);

  const handleSearch = (newQuery) => {
    setQuery(newQuery);
    fetchHubSpotContacts({ query: newQuery });
  };

  const handleLoadMore = async () => {
    setLoadingMore(true);
    await loadMore(query);
    setLoadingMore(false);
  };

  const handleSelect = (contact) => {
    setSelectedContact(contact);
    if (onChange) onChange(contact.id);
    if (onContactSelect) onContactSelect(contact);
  };

  const handleRetry = () => {
    resetRateLimit();
    fetchHubSpotContacts({ query });
  };

  return (
    <div className={cn("flex flex-col gap-3", className)}>
       <HubSpotContactSearchInput 
          value={query}
          onChange={handleSearch}
          loading={loading && !loadingMore}
          placeholder={placeholder}
       />
       
       <Card className="p-1 min-h-[250px] bg-gray-50/30">
          {error ? (
             <div className="flex flex-col items-center justify-center h-[200px] text-center p-4">
                <AlertTriangle className="h-8 w-8 text-yellow-500 mb-2" />
                <p className="text-sm text-gray-900 font-medium mb-1">Unable to load contacts</p>
                <p className="text-xs text-muted-foreground mb-4 max-w-[200px]">{error}</p>
                <Button size="sm" variant="outline" onClick={handleRetry}>
                   <RefreshCw className="h-3 w-3 mr-2" /> Retry
                </Button>
             </div>
          ) : (
             <HubSpotContactSearchResults 
               contacts={contacts}
               selectedId={selectedContact?.id || value}
               onSelect={handleSelect}
               loading={loading}
               hasMore={pagination.hasMore}
               onLoadMore={handleLoadMore}
               totalCount={pagination.total}
               loadingMore={loadingMore}
               searchQuery={query}
             />
          )}
       </Card>

       {/* Rate Limit Notice if Active */}
       {rateLimitInfo.isRateLimited && (
         <div className="bg-yellow-50 text-yellow-800 text-xs p-2 rounded-md border border-yellow-200 flex items-center justify-between">
            <span>Rate limit reached. Auto-retry in {rateLimitInfo.retryAfter}s.</span>
            <Button variant="ghost" size="sm" className="h-5 px-2 text-xs" onClick={handleRetry}>
              Retry Now
            </Button>
         </div>
       )}
    </div>
  );
};

export default HubSpotContactSelector;