import { corsHeaders } from "./cors.ts";
import { OFFICE_ROLES, requireCaller, safeHubSpotId } from "../_shared/auth.ts";

const HUBSPOT_API_BASE = "https://api.hubapi.com";

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const caller = await requireCaller(req, corsHeaders, OFFICE_ROLES)
    if (caller instanceof Response) return caller

    const { action, entityType, entityId } = await req.json();
    
    // Get token
    const hubspotToken = Deno.env.get('HUBSPOT_ACCESS_TOKEN');
    if (!hubspotToken) {
      throw new Error('HUBSPOT_ACCESS_TOKEN secret is missing');
    }

    const supabase = caller.admin

    let result = null;

    if (action === 'fetch-contacts') {
       // Fetch contacts from HubSpot
       const response = await fetch(`${HUBSPOT_API_BASE}/crm/v3/objects/contacts?properties=firstname,lastname,email,company,phone`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${hubspotToken}`,
            'Content-Type': 'application/json'
          }
       });

       const data = await response.json();
       
       if (!response.ok) {
         throw new Error(`HubSpot API Error: ${JSON.stringify(data)}`);
       }

       result = {
          success: true,
          contacts: data.results.map(contact => ({
            id: contact.id,
            first_name: contact.properties.firstname,
            last_name: contact.properties.lastname,
            email: contact.properties.email,
            phone: contact.properties.phone,
            company: contact.properties.company || ''
          }))
       };

    } else if (entityType === 'contact') {
       // Sync Contact Logic (existing)
       const { data: contact, error: dbError } = await supabase
         .from('contacts')
         .select('*')
         .eq('id', entityId)
         .single();
         
       if (dbError) throw new Error(`Database error: ${dbError.message}`);
       
       const properties = {
          email: contact.email,
          firstname: contact.first_name,
          lastname: contact.last_name,
          phone: contact.phone
       };

       let url = `${HUBSPOT_API_BASE}/crm/v3/objects/contacts`;
       let method = 'POST';
       
       if (contact.hubspot_contact_id) {
          const existingId = safeHubSpotId(contact.hubspot_contact_id)
          if (!existingId) throw new Error('Stored HubSpot contact id is invalid')
          url += `/${existingId}`;
          method = 'PATCH';
       }

       const response = await fetch(url, {
          method,
          headers: {
            'Authorization': `Bearer ${hubspotToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ properties })
       });
       
       const responseData = await response.json();
       
       if (!response.ok) {
         throw new Error(`HubSpot API Error: ${JSON.stringify(responseData)}`);
       }
       
       result = {
          success: true,
          hubspotId: responseData.id,
          action: method === 'POST' ? 'created' : 'updated'
       };
    } else {
        throw new Error(`Unsupported action or entity type: ${action || entityType}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Sync Function Error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
})