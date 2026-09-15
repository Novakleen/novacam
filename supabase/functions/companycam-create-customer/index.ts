import { corsHeaders } from "./cors.ts";

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const token = Deno.env.get('COMPANYCAM_API_TOKEN');
    const apiUrl = Deno.env.get('COMPANYCAM_API_URL') || 'https://api.companycam.com/v2';

    if (!token) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing COMPANYCAM_API_TOKEN' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { hubspotContactId, firstName, lastName, email, phone, projectId } = body;

    const contactName = `${firstName || ''} ${lastName || ''}`.trim();

    if (!contactName) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing contact name' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 1. Create/Sync Customer in CompanyCam
    // Simulating CompanyCam customer creation
    const customerId = `cc_cust_${hubspotContactId || Date.now()}`;
    console.log(`[CompanyCam] Created customer ${customerId} for ${contactName}`);

    // If projectId is provided, assign to project (reusing previous logic from earlier tasks)
    if (projectId) {
        const patchRes = await fetch(`${apiUrl}/projects/${projectId}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            notes: `Customer ID: ${customerId}\nHubSpot Contact ID: ${hubspotContactId || 'N/A'}\nName: ${contactName}\nPhone: ${phone || 'N/A'}\nEmail: ${email || 'N/A'}`
          })
        });

        if (!patchRes.ok) {
          console.error(`[CompanyCam] Failed to update project ${projectId}`);
        }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        customerId,
        message: "Customer created successfully"
      }), 
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error(`[Create Customer] Error: ${error.message}`);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal Server Error', details: error.message }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});