import { useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';

export const useAssignCustomer = (projectId, hubspotContactId) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const assignAsCustomer = async (contactDetails) => {
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      if (!projectId) {
        throw new Error('Project ID is required');
      }

      const { data, error: fnError } = await supabase.functions.invoke('companycam-create-customer', {
        body: {
          projectId,
          hubspotContactId,
          ...contactDetails
        }
      });

      if (fnError) {
        console.error('Edge function error:', fnError);
        throw new Error('Failed to communicate with the server.');
      }

      if (!data?.success) {
        throw new Error(data?.error || data?.details || 'Failed to assign customer to CompanyCam');
      }

      setSuccess(true);
      return { success: true, data };
    } catch (err) {
      console.error('Error in useAssignCustomer:', err);
      const errorMessage = err.message || 'An unexpected error occurred during assignment';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    error,
    success,
    assignAsCustomer
  };
};

export default useAssignCustomer;