import { corsHeaders } from "./cors.ts";
import { ALL_ROLES, requireCaller, safeExternalId } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const caller = await requireCaller(req, corsHeaders, ALL_ROLES)
    if (caller instanceof Response) return caller

    const token = Deno.env.get('COMPANYCAM_API_TOKEN') || Deno.env.get('COMPANYCAM_API_KEY');
    const apiUrl = Deno.env.get('COMPANYCAM_API_URL') || 'https://api.companycam.com/v2';

    if (!token) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing COMPANYCAM_API_TOKEN' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { projectId, customerId, contactName, hubspotContactId, phone } = body;

    const ccProjectId = safeExternalId(projectId)
    if (!ccProjectId || !contactName) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 1. Fetch current project to get original name (simplified here)
    const getRes = await fetch(`${apiUrl}/projects/${ccProjectId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    let originalName = 'Project';
    if (getRes.ok) {
      const projData = await getRes.json();
      originalName = projData.name ? projData.name.replace(/\s*-.*$/, '') : 'Project';
    }

    // 2. Format new project name
    const newProjectName = `${originalName} - ${contactName} (ID: ${hubspotContactId || 'N/A'})`;
    const newDescription = `Phone: ${phone || 'N/A'}\nCustomer ID: ${customerId}`;

    // 3. Update Project
    const patchRes = await fetch(`${apiUrl}/projects/${ccProjectId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: newProjectName,
        // Assuming description can be updated, although standard CC API might not support description directly here
        // We'll pass it anyway for compatibility
        notes: newDescription
      })
    });

    if (!patchRes.ok) {
      const errText = await patchRes.text();
      throw new Error(`Failed to update project: ${errText}`);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        projectId: ccProjectId,
        projectName: newProjectName,
        message: "Customer assigned and project updated successfully"
      }), 
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error(`[Assign Customer] Error: ${error.message}`);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal Server Error', details: error.message }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});