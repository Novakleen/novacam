import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from "./cors.ts";

const STATBEL_URL =
  'https://bestat.statbel.fgov.be/bestat/api/views/c42c9c16-9330-437b-9608-13781b795ec1/result/JSON'
const PARAMS_ID = 1

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function parseB7(payload: unknown): { price: number; day: string | null } | null {
  const facts = (payload as { facts?: Array<Record<string, unknown>> })?.facts
  if (!Array.isArray(facts)) return null

  const row = facts.find((f) => {
    const product = String(f.Product ?? f.product ?? f.Produit ?? '')
    return /diesel\s*b7/i.test(product)
  })
  if (!row) return null

  const incl =
    row['Prijs incl. BTW'] ??
    row['Prix incl. TVA'] ??
    row['Price incl. VAT'] ??
    row.price_incl_vat
  const price = Number(incl)
  if (!Number.isFinite(price) || price <= 0) return null

  const day = String(row.Dag ?? row.Date ?? row.Jour ?? '') || null
  return { price: Math.round(price * 10000) / 10000, day }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const authHeader = req.headers.get('Authorization') ?? ''
    const match = authHeader.match(/^Bearer\s+(.+)$/i)
    const token = match?.[1]?.trim() ?? ''
    if (!token) {
      return jsonResponse({ error: 'Missing or invalid Authorization header' }, 401)
    }

    const { data: callerData, error: callerError } = await supabaseAdmin.auth.getUser(token)
    if (callerError || !callerData?.user) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const { data: callerProfile, error: roleError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', callerData.user.id)
      .maybeSingle()

    if (roleError) {
      return jsonResponse({ error: 'Failed to verify caller role', details: roleError.message }, 400)
    }
    if (!callerProfile || callerProfile.role !== 'Admin') {
      return jsonResponse({ error: 'Admin privileges required' }, 403)
    }

    const res = await fetch(STATBEL_URL, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'NovaKleen-diesel-price-be/1.0',
      },
    })
    if (!res.ok) {
      return jsonResponse({ error: `Statbel HTTP ${res.status}` }, 502)
    }

    const payload = await res.json()
    const parsed = parseB7(payload)
    if (!parsed) {
      return jsonResponse({ error: 'Diesel B7 price not found in Statbel payload' }, 502)
    }

    const fetchedAt = new Date().toISOString()
    const { error: updateError } = await supabaseAdmin
      .from('margin_params')
      .update({
        diesel_eur_l_live: parsed.price,
        diesel_fetched_at: fetchedAt,
      })
      .eq('id', PARAMS_ID)

    if (updateError) {
      return jsonResponse({ error: updateError.message }, 400)
    }

    return jsonResponse({
      price: parsed.price,
      day: parsed.day,
      fetched_at: fetchedAt,
      source: 'statbel',
      product: 'Diesel B7 (€/L) incl. VAT',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    return jsonResponse({ error: message }, 400)
  }
})
