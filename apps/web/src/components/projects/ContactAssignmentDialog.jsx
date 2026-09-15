import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserPlus, Search, X, Loader2, Phone, Mail } from 'lucide-react';
import { useHubSpotContacts } from '@/hooks/useHubSpotContacts';
import { useCompanyCamCustomer } from '@/hooks/useCompanyCamCustomer';
import { supabase } from '@/lib/customSupabaseClient';

export const ContactAssignmentDialog = ({ project, open, onOpenChange, onSuccess }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContact, setSelectedContact] = useState(null);
  
  const { fetchHubSpotContacts, contacts, loading: hsLoading } = useHubSpotContacts();
  const { assignAndSync, loading } = useCompanyCamCustomer();

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      fetchHubSpotContacts({ query: searchQuery });
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery, open, fetchHubSpotContacts]);

  const handleAssign = async () => {
    if (!selectedContact || !project) return;
    
    const contactId = selectedContact.hs_object_id || selectedContact.id;
    
    // Determine if project ID is a Supabase UUID or CompanyCam Numeric ID
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(project.id));
    
    try {
      // First update local supabase project
      if (isUuid) {
        await supabase.from('projects').update({ hubspot_contact_id: String(contactId) }).eq('id', project.id);
      } else {
        await supabase.from('projects').update({ hubspot_contact_id: String(contactId) }).eq('companycam_project_id', String(project.id));
      }
    } catch (err) {
      console.warn("Could not update Supabase project contact reference:", err.message);
    }

    // Call edge functions
    const success = await assignAndSync(project, selectedContact);
    if (success) {
      onSuccess?.();
      onOpenChange(false);
    }
  };

  const currentContactId = project?.hubspot_contact_id;
  const hasCurrentContact = !!currentContactId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-blue-600" />
            Assign HubSpot Contact
          </DialogTitle>
          <DialogDescription>
            Link a contact to "{project?.name}". This will create/sync the customer in CompanyCam and update the project name.
          </DialogDescription>
        </DialogHeader>

        {hasCurrentContact && (
          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800 mb-2">
            <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-2">Currently Assigned</h4>
            <div className="flex items-center justify-between">
              <div className="text-sm text-blue-800 dark:text-blue-200 truncate pr-4">
                <span className="font-medium">ID:</span> {currentContactId}
              </div>
            </div>
          </div>
        )}

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search contacts by name, email, or phone..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button 
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              onClick={() => setSearchQuery('')}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 min-h-[250px] p-1">
          {hsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : contacts.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">
              {searchQuery ? 'No contacts found.' : 'Type to search for contacts.'}
            </div>
          ) : (
            contacts.map((c) => {
               const cId = c.hs_object_id || c.id;
               const isSelected = selectedContact?.hs_object_id === cId || selectedContact?.id === cId;
               return (
                 <div 
                   key={cId}
                   onClick={() => setSelectedContact(c)}
                   className={`p-3 rounded-xl border cursor-pointer transition-colors flex items-center justify-between
                     ${isSelected 
                       ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30' 
                       : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700'
                     }`}
                 >
                   <div className="min-w-0 flex-1">
                     <p className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">
                       {c.firstname || c.first_name} {c.lastname || c.last_name}
                     </p>
                     <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {c.email && (
                           <span className="flex items-center gap-1 truncate"><Mail className="h-3 w-3" /> {c.email}</span>
                        )}
                        {c.phone && (
                           <span className="flex items-center gap-1 shrink-0"><Phone className="h-3 w-3" /> {c.phone}</span>
                        )}
                     </div>
                   </div>
                 </div>
               )
            })
          )}
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t mt-auto">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button 
            onClick={handleAssign} 
            disabled={!selectedContact || loading}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {loading ? 'Syncing...' : 'Assign & Sync'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ContactAssignmentDialog;