import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from "./cors.ts";

Deno.serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Initialize Supabase Admin Client (Service Role for logging)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 2. Parse Request Body
    const { phoneNumber, message, contactId } = await req.json()

    if (!phoneNumber || !message) {
      return new Response(
        JSON.stringify({ error: 'Phone number and message are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 3. Get Credentials from Environment Variables
    const clientId = Deno.env.get('DIRECT7_CLIENT_ID');
    const clientSecret = Deno.env.get('DIRECT7_CLIENT_SECRET');
    
    if (!clientId || !clientSecret) {
      throw new Error('Direct7 credentials not configured in secrets');
    }

    // 4. Create Initial Log Entry
    const { data: logEntry, error: logError } = await supabaseAdmin
      .from('whatsapp_logs')
      .insert({
        phone_number: phoneNumber,
        message_content: message,
        status: 'sending',
        contact_id: contactId || null,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (logError) console.error('Error creating initial log:', logError);

    let providerResponse = null;
    let finalStatus = 'failed';
    let errorMessage = null;
    let messageId = null;

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

        // 6. Send WhatsApp Message
        // FIX: Using object structure for content with 'msg' property as requested
        const apiPayload = {
            messages: [
                {
                    channel: "whatsapp",
                    recipients: [phoneNumber],
                    content: {
                        type: "text",
                        msg: String(message)
                    },
                    msg_type: "text"
                }
            ],
            message_globals: {
               originator: "NovaKleen_WA"
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
             console.error('Direct7 API Error:', responseJson);
             throw new Error(`Direct7 WhatsApp Send Failed (${sendResponse.status}): ${JSON.stringify(responseJson)}`);
        }

        if (responseJson.request_id) {
            finalStatus = 'sent';
            messageId = responseJson.request_id;
        } else {
             if (responseJson.errors && responseJson.errors.length > 0) {
                 finalStatus = 'failed';
                 errorMessage = JSON.stringify(responseJson.errors);
             } else {
                 finalStatus = 'sent'; 
             }
        }

    } catch (err) {
        console.error('WhatsApp Send Error:', err);
        errorMessage = err.message;
        finalStatus = 'failed';
    }

    // 7. Update Log Entry
    if (logEntry) {
        await supabaseAdmin
          .from('whatsapp_logs')
          .update({
            status: finalStatus,
            provider_response: providerResponse,
            message_id: messageId,
            error_message: errorMessage
          })
          .eq('id', logEntry.id);
    }

    return new Response(
      JSON.stringify({ 
        success: finalStatus === 'sent', 
        messageId: logEntry?.id, 
        providerRequestId: messageId,
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