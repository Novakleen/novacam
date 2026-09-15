import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from "./cors.ts";

const HUBSPOT_API_BASE = "https://api.hubapi.com";

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const debugLog = {
    steps: [],
    tokenStatus: 'unknown',
    authHeaderPreview: null
  };

  try {
    const { endpoint, method = 'GET', body, queryParams } = await req.json();
    
    debugLog.steps.push('Request received');

    // 1. Retrieve Token
    // Try Deno.env first (standard secrets injection)
    let hubspotToken = Deno.env.get('HUBSPOT_ACCESS_TOKEN');
    
    if (hubspotToken) {
      debugLog.steps.push('Token found in Deno.env');
      debugLog.tokenStatus = 'loaded_from_env';
    } else {
      debugLog.steps.push('Token NOT found in Deno.env');
      debugLog.tokenStatus = 'missing';
      throw new Error('HUBSPOT_ACCESS_TOKEN secret is missing from environment variables');
    }

    // 2. Validate Token Format (Basic check)
    if (!hubspotToken.startsWith('pat-') && !hubspotToken.startsWith('CN-')) {
       debugLog.steps.push('Warning: Token does not start with expected prefix (pat- or CN-)');
    }

    // 3. Construct URL
    let url = `${HUBSPOT_API_BASE}${endpoint}`;
    
    // Add query params if they exist
    if (queryParams) {
      const qs = new URLSearchParams(queryParams).toString();
      if (qs) {
        url += (url.includes('?') ? '&' : '?') + qs;
      }
    }

    debugLog.steps.push(`Constructed URL: ${url}`);

    // 4. Construct Headers
    const headers = {
        'Authorization': `Bearer ${hubspotToken}`,
        'Content-Type': 'application/json'
    };
    
    // Log masked header for debugging
    debugLog.authHeaderPreview = `Bearer ${hubspotToken.substring(0, 10)}...${hubspotToken.substring(hubspotToken.length - 5)}`;

    const fetchOptions = {
      method,
      headers
    };

    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      fetchOptions.body = JSON.stringify(body);
    }

    debugLog.steps.push(`Sending ${method} request to HubSpot...`);

    const start = Date.now();
    const response = await fetch(url, fetchOptions);
    const duration = Date.now() - start;

    debugLog.steps.push(`Response received: ${response.status} ${response.statusText}`);

    // Parse response
    let responseData = null;
    const contentType = response.headers.get('content-type');
    try {
      if (contentType && contentType.includes('application/json')) {
        responseData = await response.json();
      } else {
        responseData = await response.text();
      }
    } catch (parseError) {
      debugLog.steps.push('Error parsing response body');
      responseData = { raw: 'Could not parse response body' };
    }

    // Extract Rate Limit Headers
    const rateLimitHeaders = {
      limit: response.headers.get('x-hubspot-ratelimit-daily'),
      remaining: response.headers.get('x-hubspot-ratelimit-daily-remaining'),
      reset: response.headers.get('x-hubspot-ratelimit-daily-reset'), // milliseconds
    };

    return new Response(JSON.stringify({
      status: response.status,
      statusText: response.statusText,
      data: responseData,
      headers: rateLimitHeaders,
      duration,
      debug: debugLog,
      request: {
        url,
        method,
        body
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Debug Function Error:', error);
    debugLog.steps.push(`Error occurred: ${error.message}`);
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message,
      debug: debugLog
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
})