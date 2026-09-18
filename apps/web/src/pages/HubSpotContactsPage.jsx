import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ContactCard from '@/components/hubspot/ContactCard';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { RefreshCw, Search, Cloud, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';
import { useHubSpotContacts } from '@/hooks/useHubSpotContacts';

const HubSpotContactsPage = () => {
  const { 
    contacts, 
    loading, 
    error, 
    pagination, 
    fetchHubSpotContacts 
  } = useHubSpotContacts();
  
  const [searchQuery, setSearchQuery] = useState('');
  const { toast } = useToast();

  // Initial Fetch
  useEffect(() => {
    fetchHubSpotContacts();
  }, [fetchHubSpotContacts]);

  const handleSearch = (e) => {
    e.preventDefault();
    fetchHubSpotContacts({ query: searchQuery });
  };

  const handleRefresh = () => {
    fetchHubSpotContacts({ query: searchQuery });
  };

  const handleLoadMore = () => {
    fetchHubSpotContacts({ query: searchQuery, isNextPage: true });
  };

  return (
    <DashboardLayout>
      <Helmet>
        <title>HubSpot Contacts (API) - Novakleen</title>
      </Helmet>

      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
                <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">HubSpot Contacts</h1>
                <Badge variant="outline" className="bg-orange-50 text-orange-600 border-orange-200">
                    <Cloud className="w-3 h-3 mr-1" /> API Connected
                </Badge>
            </div>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
                View and manage contacts directly from HubSpot CRM.
            </p>
          </div>
          <div className="flex items-center gap-3">
             <Button 
                onClick={handleRefresh} 
                variant="outline" 
                className="gap-2 bg-white dark:bg-gray-800"
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh List
              </Button>
              <Button className="bg-[#ff7a59] hover:bg-[#ff8f73] text-white" onClick={() => window.open('https://app-eu1.hubspot.com/contacts/144564857/contacts/list/view/all/', '_blank')}>
                 Open HubSpot CRM
              </Button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="flex flex-col md:flex-row gap-4 items-center bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm p-4 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm">
           <form onSubmit={handleSearch} className="relative w-full md:w-96">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
             <Input 
               placeholder="Search by name, email or company..." 
               value={searchQuery}
               onChange={(e) => setSearchQuery(e.target.value)}
               className="pl-9 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 focus-visible:ring-[#ff7a59]"
             />
           </form>
           <Button type="submit" onClick={handleSearch} disabled={loading} variant="secondary">
              Search
           </Button>
           
           <div className="ml-auto text-sm text-muted-foreground">
              {pagination.total > 0 && (
                  <span>Total: <strong>{pagination.total}</strong> records</span>
              )}
           </div>
        </div>

        {/* Content Area */}
        {loading && contacts.length === 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="h-48 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <Card className="border-red-200 bg-red-50 dark:bg-red-900/20">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <h3 className="text-lg font-semibold text-red-900 dark:text-red-300">API Error</h3>
              <p className="text-red-600 dark:text-red-400 max-w-md mt-2 mb-6">{error}</p>
              <Button onClick={handleRefresh} variant="destructive">Try Again</Button>
            </CardContent>
          </Card>
        ) : contacts.length === 0 ? (
          <Card className="border-dashed border-2 bg-transparent shadow-none">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center text-gray-500">
              <Search className="h-12 w-12 text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">No contacts found</h3>
              <p className="max-w-sm mt-2">
                {searchQuery 
                  ? `No results matching "${searchQuery}" in HubSpot.` 
                  : `Your HubSpot contact list is empty.`}
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
            >
                {contacts.map((contact) => (
                <motion.div
                    key={contact.id}
                    layoutId={`contact-${contact.id}`}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                >
                    <ContactCard 
                        contact={contact} 
                        onClick={() => {}} // No detail modal for API-only view unless we fetch details
                    />
                </motion.div>
                ))}
            </motion.div>

            {pagination.hasMore && (
                <div className="flex justify-center pt-8 pb-12">
                    <Button 
                        onClick={handleLoadMore} 
                        disabled={loading}
                        variant="secondary"
                        size="lg"
                        className="w-48"
                    >
                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Load More
                    </Button>
                </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default HubSpotContactsPage;