import { useState, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';

export const useHubSpotDebug = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [rateLimits, setRateLimits] = useState(null);

  const addLog = useCallback((entry) => {
    setLogs(prev => [{
      id: Date.now() + Math.random(),
      timestamp: new Date(),
      ...entry
    }, ...prev]);
  }, []);

  const clearLogs = useCallback(() => setLogs([]), []);

  const makeApiCall = useCallback(async ({ endpoint, method = 'GET', body = null, queryParams = null, label = 'API Call' }) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('hubspot-debug-api', {
        body: { endpoint, method, body, queryParams }
      });

      if (error) throw error;

      if (data.headers && data.headers.limit) {
        setRateLimits(data.headers);
      }

      addLog({
        type: data.status >= 200 && data.status < 300 ? 'success' : 'error',
        label,
        details: {
          request: data.request,
          response: {
            status: data.status,
            statusText: data.statusText,
            data: data.data,
            headers: data.headers
          },
          duration: data.duration
        }
      });

      return { success: true, ...data };
    } catch (err) {
      console.error('HubSpot Debug Error:', err);
      addLog({
        type: 'error',
        label,
        details: {
          error: err.message || 'Unknown error occurred'
        }
      });
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, [addLog]);

  const testConnection = useCallback(() => {
    return makeApiCall({
      endpoint: '/crm/v3/properties/contacts',
      queryParams: { limit: 1 },
      label: 'Test Connection'
    });
  }, [makeApiCall]);

  const fetchContacts = useCallback((limit = 10, after = undefined) => {
    const queryParams = { limit, properties: 'email,firstname,lastname,phone,company' };
    if (after) queryParams.after = after;
    
    return makeApiCall({
      endpoint: '/crm/v3/objects/contacts',
      queryParams,
      label: 'Fetch Contacts'
    });
  }, [makeApiCall]);

  const createContact = useCallback((properties) => {
    return makeApiCall({
      endpoint: '/crm/v3/objects/contacts',
      method: 'POST',
      body: { properties },
      label: 'Create Contact'
    });
  }, [makeApiCall]);

  const fetchProperties = useCallback(() => {
    return makeApiCall({
      endpoint: '/crm/v3/properties/contacts',
      label: 'Fetch Properties'
    });
  }, [makeApiCall]);

  return {
    logs,
    clearLogs,
    loading,
    rateLimits,
    makeApiCall,
    testConnection,
    fetchContacts,
    createContact,
    fetchProperties
  };
};

export default useHubSpotDebug;