import { supabase } from '@/lib/customSupabaseClient';
import { processHubSpotFunnelData } from '@/lib/hubspotService';

/**
 * Triggers a fresh pull of HubSpot data, processes it, and upserts into the cache table.
 * Can be run manually or triggered via a serverless cron job pointing to an endpoint that calls this.
 */
export const refreshHubspotData = async () => {
  try {
    console.log("[HubSpot Sync] Starting data refresh...");
    const records = await processHubSpotFunnelData();
    
    if (records.length === 0) {
      console.log("[HubSpot Sync] No records to update.");
      return { success: true, count: 0 };
    }

    console.log(`[HubSpot Sync] Upserting ${records.length} records into cache...`);
    
    const { error } = await supabase
      .from('hubspot_funnel_cache')
      .upsert(records, { onConflict: 'month,sales_rep_id' });

    if (error) {
      console.error("[HubSpot Sync] Upsert error:", error);
      throw error;
    }

    console.log("[HubSpot Sync] Data refresh complete.");
    return { success: true, count: records.length };
  } catch (error) {
    console.error("[HubSpot Sync] Failed to refresh data:", error);
    throw error;
  }
};