import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from "./cors.ts";

Deno.serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Initialize Supabase Admin Client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 2. Parse Request Body
    const { phone, message, contactId, templateId } = await req.json()

    if (!phone || !message) {
      return new Response(
        JSON.stringify({ error: 'Phone number and message are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 3. Get Credentials
    const clientId = Deno.env.get('DIRECT7_CLIENT_ID');
    const clientSecret = Deno.env.get('DIRECT7_CLIENT_SECRET');
    
    if (!clientId || !clientSecret) {
      throw new Error('Direct7 credentials not configured in secrets');
    }

    // 4. Create Initial Log Entry
    const { data: logEntry, error: logError } = await supabaseAdmin
      .from('sms_logs')
      .insert({
        phone,
        content: message,
        status: 'sending',
        contact_id: contactId || null,
        template_id: templateId || null,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (logError) console.error('Error creating initial log:', logError);

    let providerResponse = null;
    let finalStatus = 'failed';
    let errorMessage = null;

    try {
        // 5. Authenticate with Direct7
        const authFormData = new FormData();
        authFormData.append('client_id', clientId);
        authFormData.append('client_secret', clientSecret);

        const authResponse = await fetch('https://api.d7networks.com/auth/v1/login/application', {
            method: 'POST',
            body: authFormData
        });

        if (!authResponse.ok) {
            const errorText = await authResponse.text();
            throw new Error(`Direct7 Auth Failed: ${authResponse.status} - ${errorText}`);
        }

        const authData = await authResponse.json();
        const accessToken = authData.access_token;

        // 6. Send SMS with Correct Payload Format
        // Transforming into "messages" array format as requested
        // Using "recipients" array for D7 compatibility, and including "content" and "msg_type"
        const apiPayload = {
            messages: [
                {
                    channel: "sms",
                    recipients: [phone], // D7 expects an array of strings here
                    content: message,
                    msg_type: "text", // Default type
                    data_coding: "text"
                }
            ],
            message_globals: {
                originator: "NovaKleen" // Sender ID
            }
        };

        const sendResponse = await fetch('https://api.d7networks.com/messages/v1/send', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(apiPayload)
        });

        const responseText = await sendResponse.text();
        let responseJson;
        try {
            responseJson = JSON.parse(responseText);
        } catch (e) {
            responseJson = { raw: responseText };
        }
        
        providerResponse = responseJson;

        if (!sendResponse.ok) {
            // Include payload in error for debugging if possible (masked)
             throw new Error(`Direct7 Send Failed (${sendResponse.status}): ${JSON.stringify(responseJson)}`);
        }

        // Check for success indicators in response
        if (responseJson.request_id) {
            finalStatus = 'sent';
        } else {
             // Handle partial failures or unexpected 200s
             if (responseJson.errors && responseJson.errors.length > 0) {
                 finalStatus = 'failed';
                 errorMessage = JSON.stringify(responseJson.errors);
             } else {
                 finalStatus = 'sent'; // Optimistic success
             }
        }

    } catch (err) {
        console.error('SMS Send Error:', err);
        errorMessage = err.message;
        providerResponse = { error: err.message, full_response: providerResponse };
        finalStatus = 'failed';
    }

    // 7. Update Log
    if (logEntry) {
        await supabaseAdmin
          .from('sms_logs')
          .update({
            status: finalStatus,
            provider_response: providerResponse,
          })
          .eq('id', logEntry.id);
    }

    return new Response(
      JSON.stringify({ 
        success: finalStatus === 'sent', 
        messageId: logEntry?.id, 
        response: providerResponse,
        error: errorMessage
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})