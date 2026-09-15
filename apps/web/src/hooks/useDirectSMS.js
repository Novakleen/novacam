import { useState, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';

const useDirectSMS = () => {
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const { toast } = useToast();

  const sendSMS = useCallback(async ({ phone, message, contactId = null, templateId = null }) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('direct7-send-sms', {
        body: { phone, message, contactId, templateId }
      });

      if (error) throw error;
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to send SMS via provider');
      }

      return data;
    } catch (error) {
      console.error('Error sending SMS:', error);
      toast({
        title: "SMS Failed",
        description: error.message || "Could not send message.",
        variant: "destructive",
      });
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const getSMSHistory = useCallback(async (limit = 50, offset = 0) => {
    setHistoryLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('direct7-get-sms-history', {
        body: { limit, offset }
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching SMS history:', error);
      toast({
        title: "Fetch Failed",
        description: "Could not load SMS history.",
        variant: "destructive",
      });
      return { success: false, logs: [] };
    } finally {
      setHistoryLoading(false);
    }
  }, [toast]);

  return {
    sendSMS,
    getSMSHistory,
    loading,
    historyLoading
  };
};

export default useDirectSMS;