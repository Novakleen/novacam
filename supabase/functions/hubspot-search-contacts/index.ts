import { corsHeaders } from "./cors.ts";

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { query, limit = 50, after, properties, sort } = await req.json();
    
    // Default properties if not provided
    const propsToFetch = properties || [
      "firstname", 
      "lastname", 
      "email", 
      "phone", 
      "company", 
      "jobtitle", 
      "website", 
      "lifecyclestage"
    ];

    // Get HubSpot Access Token from secret
    const HUBSPOT_ACCESS_TOKEN = Deno.env.get("HUBSPOT_ACCESS_TOKEN");

    if (!HUBSPOT_ACCESS_TOKEN) {
      throw new Error("Missing HUBSPOT_ACCESS_TOKEN configuration");
    }

    let url = "https://api.hubapi.com/crm/v3/objects/contacts/search";
    let method = "POST";
    let body: any = {
      limit,
      properties: propsToFetch,
      // Default sort by created date if not specified, to show newest first
      sorts: sort || [{ propertyName: "createdate", direction: "DESCENDING" }],
    };

    if (after) {
      body.after = after;
    }

    // specific search query construction
    if (query && query.trim().length > 0) {
      const searchTerm = query.trim();
      // Apply wildcards to the search term to enable substring matching
      // e.g. "perm" becomes "*perm*" which matches "Permentier"
      const wildcardQuery = `*${searchTerm}*`;

      body.filterGroups = [
        // Group 1: Match First Name
        {
          filters: [
            { propertyName: "firstname", operator: "CONTAINS_TOKEN", value: wildcardQuery },
          ]
        },
        // Group 2: Match Last Name
        {
          filters: [
            { propertyName: "lastname", operator: "CONTAINS_TOKEN", value: wildcardQuery },
          ]
        },
        // Group 3: Match Email
        {
          filters: [
            { propertyName: "email", operator: "CONTAINS_TOKEN", value: wildcardQuery },
          ]
        },
        // Group 4: Match Company
        {
           filters: [
             { propertyName: "company", operator: "CONTAINS_TOKEN", value: wildcardQuery }
           ]
        },
        // Group 5: Match Phone (Standard token match often works best for phone numbers without wildcards, 
        // but wildcards help if formatting varies. We'll try wildcard first)
        {
          filters: [
             { propertyName: "phone", operator: "CONTAINS_TOKEN", value: wildcardQuery }
          ]
        }
      ];
    } else {
      // If no query, return distinct recent contacts
      body.filterGroups = []; 
    }

    console.log(`[HubSpot Search] Query: "${query}", Filters: ${JSON.stringify(body.filterGroups)}`);

    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${HUBSPOT_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    // Rate Limit Handling
    const rateLimitDaily = response.headers.get('X-HubSpot-RateLimit-Daily');
    const rateLimitRemaining = response.headers.get('X-HubSpot-RateLimit-Daily-Remaining');
    const rateLimitInterval = response.headers.get('X-HubSpot-RateLimit-Interval-Milliseconds');
    const rateLimitNext = response.headers.get('X-HubSpot-RateLimit-Rr-10s-Remaining');

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({
          success: false,
          error: "Rate limit exceeded. Please try again later.",
          isRateLimited: true,
          retryAfter: response.headers.get('Retry-After')
        }), { 
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      const errorData = await response.json();
      console.error("[HubSpot API Error]", errorData);
      throw new Error(errorData.message || 'HubSpot API request failed');
    }

    const data = await response.json();

    return new Response(JSON.stringify({
      success: true,
      contacts: data.results.map((c: any) => ({
        id: c.id,
        ...c.properties,
        // Ensure standard fields exist at top level for convenience
        first_name: c.properties.firstname,
        last_name: c.properties.lastname,
        email: c.properties.email,
        phone: c.properties.phone,
        company: c.properties.company,
        hubspot_contact_id: c.id,
        is_hubspot_api: true 
      })),
      total: data.total,
      paging: data.paging,
      rateLimit: {
        daily: rateLimitDaily,
        remaining: rateLimitRemaining,
        interval: rateLimitInterval,
        nextBurst: rateLimitNext
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error("[Function Error]", error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});