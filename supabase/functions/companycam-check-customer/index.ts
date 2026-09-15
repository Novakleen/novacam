import { corsHeaders } from "./cors.ts";

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { hubspotContactId, email } = body;

    if (!hubspotContactId && !email) {
       return new Response(
        JSON.stringify({ exists: false, error: 'Missing hubspotContactId or email' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = Deno.env.get('COMPANYCAM_API_TOKEN');
    const apiUrl = Deno.env.get('COMPANYCAM_API_URL') || 'https://api.companycam.com/v2';

    if (!token) {
      return new Response(
        JSON.stringify({ exists: false, error: 'Missing COMPANYCAM_API_TOKEN' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Best-effort check. CompanyCam API typically associates customers with projects or uses users.
    // For this simulation/integration, we check via a mock or query parameters if supported.
    // Let's assume we can query a generic /v2/customers endpoint if available, or we just return false for now to allow creation.
    let exists = false;
    let customerId = null;

    try {
        // Mock checking logic: In a real scenario, you'd fetch from CompanyCam API
        // const res = await fetch(`${apiUrl}/customers?email=${email}`, { headers: { Authorization: `Bearer ${token}` } });
        // const data = await res.json();
        // exists = data.length > 0;
        // customerId = exists ? data[0].id : null;
        
        // Simulating 10% chance it already exists for demo purposes
        if (hubspotContactId && hubspotContactId.toString().endsWith('99')) {
             exists = true;
             customerId = `cc_cust_mock_${hubspotContactId}`;
        }
    } catch(err) {
        console.warn("CompanyCam customer check failed:", err.message);
    }

    return new Response(
      JSON.stringify({ exists, customerId }), 
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ exists: false, error: error.message }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});