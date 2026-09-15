import { useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';

export const useCompanyCamCustomerSync = () => {
  const [loadingStates, setLoadingStates] = useState({});

  const setContactLoading = (id, isLoading) => {
    setLoadingStates(prev => ({ ...prev, [id]: isLoading }));
  };

  const checkCustomerExists = async (hubspotContactId, email) => {
    try {
      const { data, error } = await supabase.functions.invoke('companycam-check-customer', {
        body: { hubspotContactId, email }
      });
      if (error) throw error;
      return data;
    } catch (err) {
      console.error('Error checking customer:', err);
      return { exists: false, error: err.message };
    }
  };

  const createCustomer = async (contact) => {
    const contactId = contact.id || contact.hs_object_id;
    setContactLoading(contactId, true);
    
    try {
      const { data, error } = await supabase.functions.invoke('companycam-create-customer', {
        body: {
          hubspotContactId: contactId,
          firstName: contact.firstname || contact.first_name,
          lastName: contact.lastname || contact.last_name,
          email: contact.email,
          phone: contact.phone
        }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      return { success: true, customerId: data.customerId };
    } catch (err) {
      console.error('Error creating customer:', err);
      return { success: false, error: err.message };
    } finally {
      setContactLoading(contactId, false);
    }
  };

  return {
    loadingStates,
    checkCustomerExists,
    createCustomer
  };
};

export default useCompanyCamCustomerSync;