import { useState, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';

export default function useWhatsApp() {
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState(null);

  const sendWhatsApp = async ({ phoneNumber, message, contactId }) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: funcError } = await supabase.functions.invoke('direct7-send-whatsapp', {
        body: { phoneNumber, message, contactId }
      });

      if (funcError) throw funcError;
      
      // Even if function invocation succeeds, the logical operation might have failed
      if (data && !data.success) {
          throw new Error(data.error || 'Failed to send WhatsApp message');
      }

      return { success: true, ...data };
    } catch (err) {
      console.error('Error sending WhatsApp:', err);
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  const getWhatsAppHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const { data, error: dbError } = await supabase
        .from('whatsapp_logs')
        .select('*')
        .order('created_at', { ascending: false });

      if (dbError) throw dbError;
      return { success: true, logs: data };
    } catch (err) {
      console.error('Error fetching WhatsApp history:', err);
      return { success: false, error: err.message, logs: [] };
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  return {
    sendWhatsApp,
    getWhatsAppHistory,
    loading,
    historyLoading,
    error
  };
}