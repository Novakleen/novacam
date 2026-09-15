import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from './cors.ts'

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Verify Authentication
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Missing Authorization header')
    }

    // Create a Supabase client with the user's token to verify identity
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    // Get the user from the token
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    
    if (userError || !user) {
      console.error('Auth error:', userError)
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized', details: userError?.message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Parse Request
    const { projectId } = await req.json()
    if (!projectId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Project ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 3. Verify Ownership (using the user client)
    const { data: project, error: projectError } = await supabaseClient
      .from('projects')
      .select('created_by')
      .eq('id', projectId)
      .single()

    if (projectError || !project) {
       return new Response(
        JSON.stringify({ success: false, error: 'Project not found or permission denied' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Allow deletion if user is the creator
    if (project.created_by !== user.id) {
       return new Response(
        JSON.stringify({ success: false, error: 'Only the project owner can delete this project' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 4. Perform Cascade Delete (using Service Role for full access)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // A. Delete Storage Files
    // Fetch all media for this project to get file paths
    const { data: mediaFiles } = await supabaseAdmin
      .from('media')
      .select('file_url')
      .eq('project_id', projectId)

    if (mediaFiles && mediaFiles.length > 0) {
        const buckets = ['project-media', 'quotes']; // Add other buckets if needed
        
        for (const bucket of buckets) {
            const pathsToDelete = [];
            for (const file of mediaFiles) {
                if (file.file_url && file.file_url.includes(`/${bucket}/`)) {
                    // Extract path after bucket name
                    // URL format: .../storage/v1/object/public/bucket-name/path/to/file
                    const parts = file.file_url.split(`/${bucket}/`);
                    if (parts.length > 1) {
                        pathsToDelete.push(parts[1]);
                    }
                }
            }
            
            if (pathsToDelete.length > 0) {
                const { error: storageError } = await supabaseAdmin.storage
                    .from(bucket)
                    .remove(pathsToDelete);
                
                if (storageError) {
                    console.error(`Error deleting from ${bucket}:`, storageError);
                    // Continue anyway to try deleting DB records
                }
            }
        }
    }

    // B. Delete Database Records
    // We delete child records first to avoid FK constraints if CASCADE isn't set on DB level
    
    const tablesToDelete = [
        'project_comments',
        'project_members',
        'project_tags',
        'before_after_comparisons',
        'media',
        'upload_logs',
        'project_contacts'
    ];

    for (const table of tablesToDelete) {
        const { error: tableError } = await supabaseAdmin
            .from(table)
            .delete()
            .eq('project_id', projectId);
            
        if (tableError) {
            console.error(`Error deleting from ${table}:`, tableError);
        }
    }

    // C. Delete the Project itself
    const { error: deleteError } = await supabaseAdmin
      .from('projects')
      .delete()
      .eq('id', projectId)

    if (deleteError) {
        throw deleteError
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Edge Function Error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})