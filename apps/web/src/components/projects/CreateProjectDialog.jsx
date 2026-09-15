import React, { useState } from 'react';
import { Loader2, User } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ContactSelectionFlow from '@/components/hubspot/ContactSelectionFlow';
import AddressSelector from '@/components/ui/AddressSelector';

const CreateProjectDialog = ({ open, onOpenChange, onSuccess }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState('');
  
  // State for address management
  const [selectedAddressData, setSelectedAddressData] = useState(null);
  
  const [description, setDescription] = useState('');
  const [selectedContact, setSelectedContact] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const handleAddressSelect = (addressData) => {
    setSelectedAddressData(addressData);
    if (errors.address) {
      setErrors(prev => ({ ...prev, address: null }));
    }
  };

  const validate = () => {
    const newErrors = {};
    if (!name) newErrors.name = "Project name is required";
    if (!selectedAddressData) newErrors.address = "Address is required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    
    setLoading(true);

    try {
      console.log("[CreateProject] Starting creation with contact:", selectedContact);

      // Extract address details safely
      const addressString = selectedAddressData.formattedAddress || selectedAddressData.display_name || '';
      const lat = selectedAddressData.latitude || selectedAddressData.lat || null;
      const lng = selectedAddressData.longitude || selectedAddressData.lon || selectedAddressData.lng || null;

      // 1. Create Project
      const projectPayload = {
        name,
        address: addressString, 
        full_address: addressString, 
        latitude: lat,
        longitude: lng,
        description,
        created_by: user.id,
        hubspot_contact_id: selectedContact?.id || null 
      };

      const { data: project, error } = await supabase
        .from('projects')
        .insert([projectPayload])
        .select()
        .single();

      if (error) throw error;
      console.log("[CreateProject] Project created:", project.id);

      // 2. Add creator as project member
      await supabase
        .from('project_members')
        .insert([
          {
            project_id: project.id,
            user_id: user.id,
          }
        ]);
        
      // 3. Link Contact in project_contacts table if selected
      if (selectedContact) {
        const contactPayload = {
             first_name: selectedContact.first_name || selectedContact.firstname || 'Unknown',
             last_name: selectedContact.last_name || selectedContact.lastname || '',
             email: selectedContact.email || null,
             phone: selectedContact.phone || null,
             hubspot_contact_id: selectedContact.id,
             source: 'hubspot_api',
             status: 'active'
        };

        const { data: localContact, error: contactError } = await supabase
          .from('contacts')
          .upsert(contactPayload, { onConflict: 'hubspot_contact_id' })
          .select()
          .single();
        
        if (contactError) {
             console.error("[CreateProject] Error upserting contact:", contactError);
             toast({ variant: "warning", title: "Contact Sync Warning", description: "Project created, but contact details couldn't be saved locally." });
        } else if (localContact) {
             await supabase
              .from('project_contacts')
              .insert({
                  project_id: project.id,
                  contact_id: localContact.id,
                  hubspot_contact_id: selectedContact.id
              });
        }
      }

      // 4. Sync to HubSpot (Create Deal)
      if (selectedContact) {
          try {
            const { error: syncError } = await supabase.functions.invoke('sync-project-to-hubspot', {
              body: {
                projectId: project.id,
                hubspotContactId: selectedContact.id,
                projectName: name,
                projectAddress: addressString,
                description: description
              }
            });

            if (syncError) {
               console.error('[CreateProject] HubSpot Sync Error:', syncError);
            }
          } catch (syncEx) {
             console.error('[CreateProject] HubSpot Sync Exception:', syncEx);
          }
      }

      toast({
        title: "Success",
        description: "Project created successfully",
      });

      // Reset form
      setName('');
      setSelectedAddressData(null);
      setDescription('');
      setSelectedContact(null);
      setErrors({});
      
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('[CreateProject] Critical Error:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to create project",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-xl max-h-[90vh] overflow-y-auto sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          <div className="grid grid-cols-1 gap-4">
             <div className="space-y-2">
                <Label htmlFor="name">Project Name *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter project name"
                  className={errors.name ? 'border-red-500' : ''}
                />
                {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
             </div>
             
             <div className="space-y-2">
                <Label htmlFor="address">Address *</Label>
                <AddressSelector
                  value={selectedAddressData}
                  onAddressSelect={handleAddressSelect}
                  placeholder="Search project location (e.g. '123 Main St')..."
                />
                {errors.address && <p className="text-xs text-red-500">{errors.address}</p>}
             </div>
          </div>

          <div className="space-y-2 p-4 bg-gray-50 rounded-lg border">
            <ContactSelectionFlow 
               value={selectedContact?.id}
               onContactSelect={(contact) => {
                   setSelectedContact(contact);
               }}
            />
            {selectedContact && (
               <div className="flex items-center gap-2 mt-2 text-sm text-green-600 bg-green-50 p-2 rounded border border-green-200">
                  <User className="h-4 w-4" />
                  <span>Linked: <strong>{selectedContact.first_name || selectedContact.firstname} {selectedContact.last_name || selectedContact.lastname}</strong></span>
               </div>
            )}
            {errors.selectedContact && <p className="text-xs text-red-500 mt-1">{errors.selectedContact}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter project description"
              className="w-full min-h-[100px] px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="rounded-lg"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="rounded-lg min-w-[120px]">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {loading ? 'Creating...' : 'Create Project'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateProjectDialog;