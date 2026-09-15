import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from "./cors.ts";

const HUBSPOT_API_BASE = "https://api.hubapi.com";

// Valid pipeline stage IDs for the user's HubSpot configuration
const VALID_DEAL_STAGES = [
  '582811868', '582811869', '582811870', '582811871', '582811874', 
  '582811875', '4195566808', '4197112018', '607847131', '1252347088', '711292903'
];

// Default to the first stage (likely "New" or "Qualified") if none provided or invalid
const DEFAULT_DEAL_STAGE = '582811868';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { projectId, hubspotContactId, projectName, projectAddress, description, dealStage } = await req.json();

    console.log(`Starting sync for project: ${projectName} (ID: ${projectId})`);

    const hubspotToken = Deno.env.get('HUBSPOT_ACCESS_TOKEN');
    if (!hubspotToken) throw new Error('HUBSPOT_ACCESS_TOKEN secret is missing');

    if (!hubspotContactId) {
        throw new Error('HubSpot Contact ID is required for syncing project');
    }

    // Validate dealStage
    let selectedStage = dealStage;
    if (!selectedStage) {
        console.log(`No dealStage provided. Using default: ${DEFAULT_DEAL_STAGE}`);
        selectedStage = DEFAULT_DEAL_STAGE;
    } else if (!VALID_DEAL_STAGES.includes(String(selectedStage))) {
        console.warn(`Invalid dealStage provided: '${dealStage}'. Falling back to default: ${DEFAULT_DEAL_STAGE}`);
        selectedStage = DEFAULT_DEAL_STAGE;
    } else {
        console.log(`Using provided valid dealStage: ${selectedStage}`);
    }

    // 1. Create a Deal representing the project
    const dealProperties = {
        dealname: projectName,
        dealstage: selectedStage,
        pipeline: 'default', // Explicitly setting pipeline often helps avoid ambiguity
        amount: '0', // Or calculate from project value if available
        description: `Address: ${projectAddress}\n\n${description || ''}`
    };

    console.log('Sending Deal properties to HubSpot:', JSON.stringify(dealProperties));

    const dealResponse = await fetch(`${HUBSPOT_API_BASE}/crm/v3/objects/deals`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${hubspotToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ properties: dealProperties })
    });

    const dealData = await dealResponse.json();

    if (!dealResponse.ok) {
        console.error('HubSpot API Error (Create Deal):', JSON.stringify(dealData));
        throw new Error(`Failed to create deal in HubSpot: ${dealData.message || JSON.stringify(dealData)}`);
    }

    const dealId = dealData.id;
    console.log(`Deal created successfully. ID: ${dealId}`);

    // 2. Associate Deal with Contact
    const associationUrl = `${HUBSPOT_API_BASE}/crm/v3/objects/deals/${dealId}/associations/contacts/${hubspotContactId}/deal_to_contact`;
    
    const associationResponse = await fetch(associationUrl, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${hubspotToken}`,
            'Content-Type': 'application/json'
        }
    });

    if (!associationResponse.ok) {
        const assocData = await associationResponse.json();
        console.error('Failed to associate deal with contact:', JSON.stringify(assocData));
        // Don't fail the whole request, just warn
    } else {
        console.log(`Deal ${dealId} associated with Contact ${hubspotContactId}`);
    }

    return new Response(JSON.stringify({ 
        success: true, 
        dealId,
        message: 'Project synced to HubSpot as Deal and associated with Contact'
    }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Project Sync Error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
})