import { corsHeaders } from "./cors.ts";

Deno.serve(async (req) => {
  // 1. Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 2. Check and fix authentication
    const token = Deno.env.get('COMPANYCAM_API_TOKEN');

    if (!token) {
      console.error('[Update CompanyCam Project] Error: Missing COMPANYCAM_API_TOKEN in environment variables.');
      return new Response(
        JSON.stringify({ success: false, error: 'Missing COMPANYCAM_API_TOKEN' }), 
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // 3. Verify request payload handling
    let body;
    try {
      body = await req.json();
    } catch (parseError) {
      console.error('[Update CompanyCam Project] Error: Malformed JSON request body', parseError);
      return new Response(
        JSON.stringify({ success: false, error: 'Malformed JSON request body' }), 
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const { projectId, projectName, contactInfo, projectDescription } = body;

    // Validate required fields
    if (!projectId || !projectName) {
      console.error('[Update CompanyCam Project] Error: Missing required fields (projectId, projectName)', body);
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields: projectId and projectName are required.' }), 
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // 5. Add comprehensive error logging
    console.log(`[Update CompanyCam Project] Initiating update for Project ID: ${projectId}`);
    console.log(`[Update CompanyCam Project] New Project Name: ${projectName}`);

    // 4. Fix CompanyCam API call (PATCH method)
    const url = new URL(`https://api.companycam.com/v2/projects/${projectId}`);
    
    // Construct payload - CompanyCam uses 'name' for the project name
    const payload = {
      name: projectName,
    };

    const options = {
      method: 'PATCH', // Fixed: using PATCH instead of PUT or POST
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    };

    const response = await fetch(url.toString(), options);
    const responseText = await response.text();
    
    // Handle CompanyCam API Errors
    if (!response.ok) {
      console.error(`[Update CompanyCam Project] API Error: ${response.status} ${response.statusText}`);
      console.error(`[Update CompanyCam Project] API Response Body:`, responseText);
      
      // Determine appropriate status code to return to client
      const statusCode = response.status >= 400 && response.status < 500 ? response.status : 502;
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `CompanyCam API returned ${response.status}: ${responseText}`, 
          details: responseText 
        }), 
        {
          status: statusCode,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // 6. Improve response handling (Success)
    console.log(`[Update CompanyCam Project] Successfully updated project ${projectId}`);
    
    let responseData = {};
    if (responseText) {
      try {
        responseData = JSON.parse(responseText);
      } catch (e) {
        console.warn('[Update CompanyCam Project] Warning: Could not parse successful JSON response, it may be empty.');
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Project updated successfully",
        data: responseData 
      }), 
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    // Catch-all for unexpected server errors
    console.error(`[Update CompanyCam Project] Unexpected Error: ${error.message}`);
    console.error(error.stack);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Internal Server Error',
        details: error.message 
      }), 
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});