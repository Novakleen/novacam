import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ContactSelectionFlow from '@/components/hubspot/ContactSelectionFlow';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { User, Loader2 } from 'lucide-react';
import AddressSelector from '@/components/ui/AddressSelector';

const EditProjectDialog = ({ project, open, onOpenChange, onSuccess }) => {
  const { toast } = useToast();
  const [name, setName] = useState('');
  
  // Stores the selected address object { formattedAddress, lat, lng }
  const [selectedAddressData, setSelectedAddressData] = useState(null);
  
  const [description, setDescription] = useState('');
  const [selectedContact, setSelectedContact] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (project) {
      setName(project.name);
      
      // Pre-populate address data from project
      if (project.address || project.full_address) {
        setSelectedAddressData({
          formattedAddress: project.full_address || project.address,
          lat: project.latitude,
          lng: project.longitude
        });
      } else {
        setSelectedAddressData(null);
      }
      
      setDescription(project.description || '');
      
      if (project.hubspot_contact_id) {
          setSelectedContact({ 
              id: project.hubspot_contact_id, 
          });
      }
    }
  }, [project]);

  const handleAddressSelect = (addressData) => {
    setSelectedAddressData(addressData);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      console.log("[EditProject] Updating project with contact:", selectedContact);

      // Extract details
      const addressString = selectedAddressData?.formattedAddress || selectedAddressData?.display_name || project.address || '';
      const lat = selectedAddressData?.latitude || selectedAddressData?.lat || project.latitude;
      const lng = selectedAddressData?.longitude || selectedAddressData?.lng || project.longitude;

      // 1. Update project table
      const { error } = await supabase
        .from('projects')
        .update({
          name,
          address: addressString,
          full_address: addressString,
          latitude: lat,
          longitude: lng,
          description,
          hubspot_contact_id: selectedContact?.id || null
        })
        .eq('id', project.id);

      if (error) throw error;

      // 2. Manage project_contacts link
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

         if (!contactError && localContact) {
            const { data: existingLink } = await supabase
              .from('project_contacts')
              .select('id')
              .eq('project_id', project.id)
              .eq('hubspot_contact_id', selectedContact.id)
              .maybeSingle();

            if (!existingLink) {
                await supabase.from('project_contacts').insert({
                    project_id: project.id,
                    contact_id: localContact.id,
                    hubspot_contact_id: selectedContact.id
                });
            }
         }
      }

      toast({
        title: "Success",
        description: "Project updated successfully",
      });

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("[EditProject] Error:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update project",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-xl sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Project</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          <Tabs defaultValue="details">
            <TabsList className="w-full">
               <TabsTrigger value="details" className="flex-1">Details</TabsTrigger>
               <TabsTrigger value="contact" className="flex-1">HubSpot Contact</TabsTrigger>
            </TabsList>
            
            <TabsContent value="details" className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="name">Project Name *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter project name"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Address *</Label>
                <AddressSelector
                  value={selectedAddressData}
                  onAddressSelect={handleAddressSelect}
                  placeholder="Update project location..."
                />
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
            </TabsContent>
            
            <TabsContent value="contact" className="space-y-4 pt-4">
               <div className="bg-gray-50 p-4 rounded-lg border">
                  <ContactSelectionFlow
                     value={selectedContact?.id}
                     onContactSelect={setSelectedContact}
                  />
                  {selectedContact && (selectedContact.first_name || selectedContact.firstname) && (
                    <div className="flex items-center gap-2 mt-4 text-sm text-green-600 bg-green-50 p-2 rounded border border-green-200">
                        <User className="h-4 w-4" />
                        <span>Selected: <strong>{selectedContact.first_name || selectedContact.firstname} {selectedContact.last_name || selectedContact.lastname}</strong></span>
                    </div>
                  )}
               </div>
               <p className="text-xs text-muted-foreground px-2">
                 Updating the contact here will change the primary HubSpot contact associated with this project.
               </p>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {loading ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EditProjectDialog;