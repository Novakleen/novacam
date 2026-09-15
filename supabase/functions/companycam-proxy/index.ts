import { corsHeaders } from "./cors.ts";

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { endpoint, method = 'GET', data = null, params = {} } = await req.json();
    console.log(`[CompanyCam Proxy] Received request: ${method} ${endpoint}`);
    
    // Retrieve the COMPANYCAM_API_TOKEN from the edge function environment / secrets vault
    const token = Deno.env.get('COMPANYCAM_API_TOKEN');

    if (!token) {
      console.error('[CompanyCam Proxy] Error: COMPANYCAM_API_TOKEN is missing in environment variables');
      throw new Error('COMPANYCAM_API_TOKEN is missing in environment variables. Please add it to your Supabase secrets.');
    }

    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = new URL(`https://api.companycam.com/v2${cleanEndpoint}`);
    
    // Append any URL parameters
    if (params && typeof params === 'object') {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, value.toString());
        }
      });
    }

    console.log(`[CompanyCam Proxy] Forwarding to: ${url.toString()}`);

    const options = {
      method: method.toUpperCase(),
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

    if (data && ['POST', 'PUT', 'PATCH'].includes(options.method)) {
      options.body = JSON.stringify(data);
    }

    // Call the CompanyCam API
    const response = await fetch(url.toString(), options);
    
    // Handle 204 No Content
    if (response.status === 204) {
      console.log(`[CompanyCam Proxy] Success: 204 No Content`);
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const responseText = await response.text();
    let responseData;
    
    // Try parsing JSON response
    try {
      responseData = responseText ? JSON.parse(responseText) : {};
    } catch (e) {
      console.warn('[CompanyCam Proxy] Failed to parse JSON response, returning raw text');
      responseData = { raw: responseText };
    }

    // Pass along any API-level errors
    if (!response.ok) {
      console.error(`[CompanyCam Proxy] API Error: ${response.status} ${response.statusText}`, responseData);
      return new Response(JSON.stringify({ error: responseData, status: response.status }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: response.status
      });
    }

    console.log(`[CompanyCam Proxy] Success: ${response.status}`);
    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: response.status
    });

  } catch (error) {
    console.error(`[CompanyCam Proxy] Unexpected Error: ${error.message}`);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});