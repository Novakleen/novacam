import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import HubSpotAPIStatusDisplay from './HubSpotAPIStatusDisplay';
import { 
  ArrowRightLeft,
  Cloud,
  ExternalLink
} from 'lucide-react';
import { useHubSpotContacts } from '@/hooks/useHubSpotContacts';
import { Button } from '@/components/ui/button';

// Refactored to focus purely on API debugging/viewing without import/sync logic
const HubSpotContactDebugSection = () => {
  const { 
    contacts, 
    loading, 
    error, 
    pagination, 
    fetchHubSpotContacts 
  } = useHubSpotContacts();

  // Initial load
  React.useEffect(() => {
    fetchHubSpotContacts();
  }, [fetchHubSpotContacts]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-white dark:bg-gray-800 border-l-4 border-l-orange-500 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-500 flex items-center gap-2">
                <Cloud className="w-4 h-4" /> HubSpot API
              </span>
              <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">Live Data</Badge>
            </div>
            <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">
               {loading ? '...' : pagination.total || contacts.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Total contacts accessible via API
            </p>
          </CardContent>
        </Card>

        <div className="h-full">
           <HubSpotAPIStatusDisplay lastCheckTime={new Date()} />
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4">
           <CardTitle className="text-lg flex items-center gap-2">
             <ArrowRightLeft className="w-5 h-5 text-orange-500" />
             Raw API Viewer
           </CardTitle>
           <CardDescription>
             Direct view of data returned by HubSpot Search API. No local database storage.
           </CardDescription>
        </CardHeader>
        <CardContent>
            {error && (
                <div className="p-4 bg-red-50 text-red-600 rounded-md border border-red-200 mb-4">
                    Error: {error}
                </div>
            )}
            
            <div className="rounded-md border overflow-hidden">
                <div className="bg-gray-50 p-2 text-xs font-mono border-b grid grid-cols-12 gap-2 text-gray-500 font-medium">
                    <div className="col-span-3">Name</div>
                    <div className="col-span-3">Email</div>
                    <div className="col-span-2">Phone</div>
                    <div className="col-span-2">Company</div>
                    <div className="col-span-2 text-right">HubSpot ID</div>
                </div>
                <div className="max-h-[400px] overflow-y-auto">
                    {loading && contacts.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground">Loading API data...</div>
                    ) : (
                        contacts.map(c => (
                            <div key={c.id} className="grid grid-cols-12 gap-2 p-2 text-sm border-b last:border-0 hover:bg-gray-50">
                                <div className="col-span-3 font-medium truncate">{c.first_name} {c.last_name}</div>
                                <div className="col-span-3 truncate text-muted-foreground">{c.email}</div>
                                <div className="col-span-2 truncate text-muted-foreground">{c.phone}</div>
                                <div className="col-span-2 truncate text-muted-foreground">{c.company}</div>
                                <div className="col-span-2 text-right font-mono text-xs flex items-center justify-end gap-1">
                                    {c.id}
                                    <a href={`https://app.hubspot.com/contacts/46368862/contact/${c.id}`} target="_blank" rel="noopener noreferrer">
                                        <ExternalLink className="h-3 w-3 text-blue-400 hover:text-blue-600" />
                                    </a>
                                </div>
                            </div>
                        ))
                    )}
                </div>
                {pagination.hasMore && (
                    <div className="p-2 border-t bg-gray-50 text-center">
                         <Button variant="ghost" size="sm" onClick={() => fetchHubSpotContacts({ isNextPage: true })} disabled={loading}>
                            Load More from API
                         </Button>
                    </div>
                )}
            </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default HubSpotContactDebugSection;