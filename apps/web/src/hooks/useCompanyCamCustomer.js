import { useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';

export const useCompanyCamCustomer = () => {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const syncCustomerToCompanyCam = async (contactData) => {
    try {
      const { data, error } = await supabase.functions.invoke('companycam-sync-customer', {
        body: contactData
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      return data;
    } catch (err) {
      console.error('Error syncing customer:', err);
      throw err;
    }
  };

  const assignCustomerToProject = async (assignmentData) => {
    try {
      const { data, error } = await supabase.functions.invoke('companycam-assign-customer', {
        body: assignmentData
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      return data;
    } catch (err) {
      console.error('Error assigning customer:', err);
      throw err;
    }
  };

  const getProjectCustomer = async (projectId) => {
    // This could fetch metadata from Supabase or invoke another edge function
    return null; 
  };

  const assignAndSync = async (project, contact) => {
    setLoading(true);
    try {
      const contactName = `${contact.first_name || contact.firstname || ''} ${contact.last_name || contact.lastname || ''}`.trim();
      const contactId = contact.hs_object_id || contact.id;

      // Extract correct CompanyCam ID whether this is a Supabase project or CC raw project
      const ccProjectId = project.companycam_project_id || project.id; 

      if (!ccProjectId) {
        throw new Error("Missing CompanyCam Project ID");
      }

      // 1. Sync Customer
      const syncResult = await syncCustomerToCompanyCam({
        hubspotContactId: contactId,
        projectId: ccProjectId,
        contactName,
        email: contact.email,
        phone: contact.phone
      });

      // 2. Assign Customer
      await assignCustomerToProject({
        projectId: ccProjectId,
        customerId: syncResult.customerId,
        contactName,
        hubspotContactId: contactId,
        phone: contact.phone
      });

      toast({
        title: "Success",
        description: `Contact ${contactName} assigned to project and synced to CompanyCam`
      });

      return true;
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Assignment Failed",
        description: error.message || "Failed to assign and sync customer"
      });
      return false;
    } finally {
      setLoading(false);
    }
  };

  return {
    syncCustomerToCompanyCam,
    assignCustomerToProject,
    getProjectCustomer,
    assignAndSync,
    loading
  };
};

export default useCompanyCamCustomer;