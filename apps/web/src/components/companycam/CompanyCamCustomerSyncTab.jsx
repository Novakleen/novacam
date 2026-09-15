import React, { useEffect, useState, useCallback } from 'react';
import { useHubSpotContacts } from '@/hooks/useHubSpotContacts';
import { useCompanyCamCustomerSync } from '@/hooks/useCompanyCamCustomerSync';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Search, Loader2, UserPlus, CheckCircle2, RefreshCcw } from 'lucide-react';

const CompanyCamCustomerSyncTab = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const { contacts, fetchHubSpotContacts, loading: contactsLoading } = useHubSpotContacts();
  const { createCustomer, checkCustomerExists, loadingStates } = useCompanyCamCustomerSync();
  const { toast } = useToast();
  
  const [syncStatuses, setSyncStatuses] = useState({}); // { [id]: 'not_synced' | 'synced' | 'exists' }
  const [checking, setChecking] = useState(false);
  const [bulkSyncing, setBulkSyncing] = useState(false);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchHubSpotContacts({ query: searchQuery });
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, fetchHubSpotContacts]);

  const checkStatuses = useCallback(async () => {
    if (!contacts.length) return;
    setChecking(true);
    const newStatuses = { ...syncStatuses };
    
    for (const contact of contacts) {
      const id = contact.id || contact.hs_object_id;
      if (!newStatuses[id] || newStatuses[id] === 'not_synced') {
         const res = await checkCustomerExists(id, contact.email);
         if (res.exists) {
           newStatuses[id] = 'exists';
         } else {
           newStatuses[id] = 'not_synced';
         }
      }
    }
    
    setSyncStatuses(newStatuses);
    setChecking(false);
  }, [contacts, checkCustomerExists, syncStatuses]);

  useEffect(() => {
    checkStatuses();
  }, [contacts]);

  const handleSyncSingle = async (contact) => {
    const id = contact.id || contact.hs_object_id;
    const res = await createCustomer(contact);
    if (res.success) {
       setSyncStatuses(prev => ({ ...prev, [id]: 'synced' }));
       toast({
         title: "Sync Successful",
         description: `Customer created in CompanyCam for ${contact.firstname} ${contact.lastname}`
       });
    } else {
       toast({
         variant: "destructive",
         title: "Sync Failed",
         description: res.error || "Failed to create customer"
       });
    }
  };

  const handleSyncAll = async () => {
    setBulkSyncing(true);
    let successCount = 0;
    let failCount = 0;
    
    const unsyncedContacts = contacts.filter(c => {
      const id = c.id || c.hs_object_id;
      return syncStatuses[id] === 'not_synced';
    });

    for (const contact of unsyncedContacts) {
       const res = await createCustomer(contact);
       if (res.success) {
         const id = contact.id || contact.hs_object_id;
         setSyncStatuses(prev => ({ ...prev, [id]: 'synced' }));
         successCount++;
       } else {
         failCount++;
       }
    }

    setBulkSyncing(false);
    toast({
      title: "Bulk Sync Complete",
      description: `Successfully synced ${successCount} customers. ${failCount > 0 ? `${failCount} failed.` : ''}`,
      variant: failCount > 0 ? "destructive" : "default"
    });
  };

  const getStatusBadge = (id) => {
    const status = syncStatuses[id];
    if (status === 'synced') return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">Synced</Badge>;
    if (status === 'exists') return <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">Already a Customer</Badge>;
    return <Badge variant="outline" className="text-gray-500">Not Synced</Badge>;
  };

  const unsyncedCount = contacts.filter(c => syncStatuses[c.id || c.hs_object_id] === 'not_synced').length;

  return (
    <div className="space-y-6">
      <Card className="bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm border-dashed">
        <CardContent className="p-4 flex flex-col sm:flex-row gap-4 justify-between items-center">
          <div className="relative flex-1 w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input 
              placeholder="Search contacts to sync..." 
              className="pl-9 bg-white dark:bg-gray-800"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button variant="outline" onClick={checkStatuses} disabled={checking || contactsLoading}>
              <RefreshCcw className={`h-4 w-4 mr-2 ${checking ? 'animate-spin' : ''}`} /> Check Status
            </Button>
            <Button 
               onClick={handleSyncAll} 
               disabled={bulkSyncing || unsyncedCount === 0 || contactsLoading}
               className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto"
            >
              {bulkSyncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UserPlus className="h-4 w-4 mr-2" />}
              Sync All ({unsyncedCount})
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        {contactsLoading ? (
          <div className="p-8 text-center flex flex-col items-center justify-center text-gray-500">
             <Loader2 className="h-8 w-8 animate-spin mb-4 text-blue-500" />
             <p>Loading HubSpot Contacts...</p>
          </div>
        ) : contacts.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No contacts found.
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {contacts.map((contact) => {
               const id = contact.id || contact.hs_object_id;
               const isContactLoading = loadingStates[id];
               const status = syncStatuses[id] || 'not_synced';
               
               return (
                 <div key={id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <div>
                       <div className="flex items-center gap-2 mb-1">
                         <span className="font-semibold text-gray-900 dark:text-gray-100">
                           {contact.firstname || contact.first_name} {contact.lastname || contact.last_name}
                         </span>
                         {getStatusBadge(id)}
                       </div>
                       <div className="text-sm text-gray-500 flex flex-wrap gap-x-4">
                         <span>{contact.email || 'No email'}</span>
                         <span>{contact.phone || 'No phone'}</span>
                       </div>
                    </div>
                    
                    <Button 
                      variant={status === 'synced' || status === 'exists' ? 'secondary' : 'default'}
                      size="sm"
                      disabled={isContactLoading || status === 'synced' || status === 'exists'}
                      onClick={() => handleSyncSingle(contact)}
                    >
                      {isContactLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 
                       status === 'synced' || status === 'exists' ? <CheckCircle2 className="h-4 w-4" /> : 
                       "Create Customer"}
                    </Button>
                 </div>
               )
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default CompanyCamCustomerSyncTab;