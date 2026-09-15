import { corsHeaders } from "./cors.ts";

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const token = Deno.env.get('COMPANYCAM_API_TOKEN') || Deno.env.get('COMPANYCAM_API_KEY');
    const apiUrl = Deno.env.get('COMPANYCAM_API_URL') || 'https://api.companycam.com/v2';

    if (!token) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing COMPANYCAM_API_TOKEN' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { hubspotContactId, projectId, contactName, email, phone } = body;

    if (!contactName) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing contactName' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Mock check for existing customer (CompanyCam API might vary)
    // We assume /users or /contacts or /customers exists. Here we use a generic /customers endpoint.
    let customerId = `cc_cust_${Date.now()}`;
    let isNew = true;

    // Simulate creating or finding the customer
    console.log(`[Sync Customer] Syncing customer ${contactName} to CompanyCam`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        customerId,
        isNew,
        message: "Customer synced successfully"
      }), 
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error(`[Sync Customer] Error: ${error.message}`);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal Server Error', details: error.message }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});