import { useState, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';

/**
 * Hook to manage HubSpot synchronization and testing
 */
export const useHubSpotSync = () => {
  const [testing, setTesting] = useState(false);
  
  const testConnection = useCallback(async () => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('hubspot-sync', {
        body: {
          action: 'verify',
          entityType: 'test'
        }
      });

      if (error) throw error;
      
      if (!data.success) {
        throw new Error(data.error || 'Connection verification failed');
      }

      return { connected: true, message: data.message };
    } catch (error) {
      console.error('HubSpot Connection Test Error:', error);
      return { connected: false, error: error.message };
    } finally {
      setTesting(false);
    }
  }, []);

  const syncEntity = useCallback(async (entityType, entityId) => {
    try {
      const { data, error } = await supabase.functions.invoke('hubspot-sync', {
        body: {
          action: 'sync',
          entityType,
          entityId
        }
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Manual Sync Error:', error);
      throw error;
    }
  }, []);

  return {
    testConnection,
    syncEntity,
    testing
  };
};

export default useHubSpotSync;