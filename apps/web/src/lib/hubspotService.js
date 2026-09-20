import { supabase } from '@/lib/customSupabaseClient';
import {
  HUBSPOT_INVOICE_AMOUNT_PROPERTIES,
  resolveInvoiceAmountHt,
} from '@/lib/hubspotInvoiceAmount';

/** Fallback IDs if pipeline metadata cannot be loaded */
const FALLBACK_LOST_STAGE_IDS = ['582811875', '1252347088', '711292903', '607847131'];
const FALLBACK_WON_STAGE_IDS = ['582811874', '4195566808', '4898287842'];
const INVOICED_STAGE_ID = '4197112018';

const SALES_REPS = {
  '32059962': 'Bastien BURGHART',
  '32297904': 'Anthony Cazier',
  '32494600': 'Thibeau Venken',
  '176155687': 'Rémy Gierech',
  '645018992': 'Danny Joosten'
};

/** Scopes needed to read line items / product library (private app). */
export const HUBSPOT_LINE_ITEM_READ_SCOPES = [
  'crm.objects.line_items.read',
  'crm.schemas.line_items.read',
  'e-commerce',
];
export const HUBSPOT_PRODUCT_READ_SCOPES = [
  'crm.objects.products.read',
  'e-commerce',
];

/**
 * HubSpot error payloads use { status: "error", category, message, errors[] }
 * (not { error }). The edge proxy also forwards non-2xx HubSpot JSON bodies.
 */
export class HubSpotApiError extends Error {
  constructor(message, { category = null, requiredScopes = [], payload = null } = {}) {
    super(message || 'HubSpot API error');
    this.name = 'HubSpotApiError';
    this.category = category;
    this.requiredScopes = Array.isArray(requiredScopes) ? requiredScopes : [];
    this.payload = payload;
  }

  get isMissingScopes() {
    return (
      this.category === 'MISSING_SCOPES' ||
      /MISSING_SCOPES/i.test(String(this.message || ''))
    );
  }
}

const collectRequiredScopes = (payload) => {
  if (!payload || typeof payload !== 'object') return [];
  const out = [];
  const push = (v) => {
    if (Array.isArray(v)) out.push(...v.map(String).filter(Boolean));
  };
  push(payload.requiredGranularScopes);
  push(payload.context?.requiredGranularScopes);
  push(payload.error?.requiredGranularScopes);
  push(payload.error?.context?.requiredGranularScopes);
  if (Array.isArray(payload.errors)) {
    for (const err of payload.errors) {
      push(err?.context?.requiredGranularScopes);
      push(err?.requiredGranularScopes);
    }
  }
  return [...new Set(out)];
};

const isHubSpotErrorPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return false;
  if (payload.status === 'error' || payload.category === 'MISSING_SCOPES') return true;
  if (typeof payload.error === 'string' && payload.error) return true;
  if (payload.error && typeof payload.error === 'object') return true;
  return false;
};

const throwIfHubSpotError = (payload, fallbackMessage) => {
  if (!isHubSpotErrorPayload(payload)) return;
  const scopes = collectRequiredScopes(payload);
  const category =
    payload.category ||
    payload.error?.category ||
    (scopes.length ? 'MISSING_SCOPES' : null);
  const message =
    (typeof payload.message === 'string' && payload.message) ||
    (typeof payload.error === 'string' && payload.error) ||
    payload.error?.message ||
    fallbackMessage ||
    'HubSpot API error';
  throw new HubSpotApiError(message, { category, requiredScopes: scopes, payload });
};

const invokeHubSpotProxy = async (path, method = 'GET', body = null) => {
  const { data, error } = await supabase.functions.invoke('hubspot-proxy', {
    body: { path, method, body },
  });

  // Non-2xx: Supabase may put HubSpot JSON on error.context and/or data
  if (error) {
    let ctx = null;
    try {
      if (error.context && typeof error.context.clone === 'function') {
        ctx = await error.context.clone().json();
      } else if (error.context && typeof error.context.json === 'function') {
        ctx = await error.context.json();
      } else if (error.context && typeof error.context === 'object') {
        ctx = error.context;
      }
    } catch {
      ctx = null;
    }
    const payload = ctx || data;
    if (payload) throwIfHubSpotError(payload, error.message);
    const hsMsg =
      payload?.message ||
      (typeof payload?.error === 'string' ? payload.error : null);
    throw new HubSpotApiError(hsMsg || error.message, { payload });
  }

  throwIfHubSpotError(data, 'HubSpot API error');
  if (data?.error) {
    throw new HubSpotApiError(
      typeof data.error === 'string' ? data.error : JSON.stringify(data.error),
      { payload: data, requiredScopes: collectRequiredScopes(data) }
    );
  }
  return data;
};


/**
 * Normalize stage labels/ids for matching closed-won / closed-lost variants
 * (e.g. "Closed Won", "closedwon", "Gagné", "Fermé gagné").
 */
const normalizeStageText = (value) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');

const looksLikeWonLabel = (labelOrId) => {
  const t = normalizeStageText(labelOrId);
  if (!t) return false;
  if (t.includes('invoic') || t.includes('facture')) return false;
  if (t.includes('lost') || t.includes('perdu') || t.includes('abandon')) return false;
  return (
    t.includes('closedwon') ||
    t.includes('won') ||
    t.includes('gagne') ||
    t.includes('fermeegagne') ||
    t.includes('ferme gagne'.replace(/\s/g, '')) ||
    t === 'closedwon' ||
    t.includes('dealwon') ||
    t.includes('saleclosed')
  );
};

const looksLikeLostLabel = (labelOrId) => {
  const t = normalizeStageText(labelOrId);
  if (!t) return false;
  return (
    t.includes('closedlost') ||
    t.includes('lost') ||
    t.includes('perdu') ||
    t.includes('abandon') ||
    t.includes('fermeeperdu')
  );
};

/**
 * Load all deal pipeline stages and classify closed-won vs closed-lost.
 * Uses HubSpot stage metadata (isClosed + probability) plus label heuristics
 * so every closed-won stage counts, not only the literal "closedwon" id.
 */
const fetchDealStageClassification = async () => {
  const won = new Set(FALLBACK_WON_STAGE_IDS);
  const lost = new Set(FALLBACK_LOST_STAGE_IDS);
  const invoiced = new Set([INVOICED_STAGE_ID]);

  try {
    const data = await invokeHubSpotProxy('/crm/v3/pipelines/deals');
    const pipelines = Array.isArray(data?.results) ? data.results : [];

    pipelines.forEach((pipeline) => {
      const stages = Array.isArray(pipeline?.stages) ? pipeline.stages : [];
      stages.forEach((stage) => {
        if (!stage?.id) return;
        const id = String(stage.id);
        const label = stage.label || '';
        const meta = stage.metadata || {};
        const isClosed =
          meta.isClosed === true ||
          meta.isClosed === 'true' ||
          stage.isClosed === true;
        const probability = parseFloat(meta.probability ?? stage.probability ?? NaN);

        // Explicit invoiced stage stays separate from "won"
        if (
          id === INVOICED_STAGE_ID ||
          normalizeStageText(label).includes('invoic') ||
          normalizeStageText(label).includes('facture')
        ) {
          invoiced.add(id);
          return;
        }

        if (isClosed && !Number.isNaN(probability) && probability >= 1) {
          won.add(id);
          return;
        }
        if (isClosed && !Number.isNaN(probability) && probability <= 0) {
          lost.add(id);
          return;
        }
        if (looksLikeWonLabel(label) || looksLikeWonLabel(id)) {
          won.add(id);
          return;
        }
        if (looksLikeLostLabel(label) || looksLikeLostLabel(id)) {
          lost.add(id);
          return;
        }
        // Closed without probability: treat high-prob as won if label hints win
        if (isClosed && !Number.isNaN(probability) && probability > 0.5) {
          won.add(id);
        } else if (isClosed && !Number.isNaN(probability) && probability < 0.5) {
          lost.add(id);
        }
      });
    });
  } catch (err) {
    console.warn(
      '[HubSpot Funnel] Could not load deal pipelines; using fallback stage IDs.',
      err?.message || err
    );
  }

  // Never count invoiced stages as plain "won"
  invoiced.forEach((id) => won.delete(id));

  return { wonStageIds: won, lostStageIds: lost, invoicedStageIds: invoiced };
};

const isStageInSet = (stage, set) => {
  if (stage == null || stage === '') return false;
  return set.has(String(stage));
};

const fetchAllContacts = async () => {
  let allContacts = [];
  let after = undefined;
  do {
    const query = `/crm/v3/objects/contacts?properties=hs_analytics_source,hubspot_owner_id,createdate&limit=100${after ? `&after=${after}` : ''}`;
    const data = await invokeHubSpotProxy(query);
    if (!data || !data.results) break;
    
    // Filter out OFFLINE source immediately to save memory
    const validContacts = data.results.filter(c => 
      c.properties.hs_analytics_source !== 'OFFLINE'
    );
    
    allContacts = allContacts.concat(validContacts);
    after = data.paging?.next?.after;
    
    // Simple rate limit protection
    await new Promise(r => setTimeout(r, 150)); 
  } while (after);
  return allContacts;
};

const fetchAllDeals = async () => {
  let allDeals = [];
  let after = undefined;
  do {
    const query = `/crm/v3/objects/deals?properties=dealstage,closedate,hubspot_owner_id,amount,createdate&associations=contacts&limit=100${after ? `&after=${after}` : ''}`;
    const data = await invokeHubSpotProxy(query);
    if (!data || !data.results) break;
    allDeals = allDeals.concat(data.results);
    after = data.paging?.next?.after;
    
    await new Promise(r => setTimeout(r, 150));
  } while (after);
  return allDeals;
};

export const processHubSpotFunnelData = async () => {
  try {
    console.log("Fetching HubSpot deal stage classification...");
    const { wonStageIds, lostStageIds, invoicedStageIds } =
      await fetchDealStageClassification();
    console.log(
      `Stages — won: ${wonStageIds.size}, lost: ${lostStageIds.size}, invoiced: ${invoicedStageIds.size}`
    );

    console.log("Fetching HubSpot Contacts...");
    const contacts = await fetchAllContacts();
    console.log(`Fetched ${contacts.length} valid contacts.`);
    
    console.log("Fetching HubSpot Deals...");
    const deals = await fetchAllDeals();
    console.log(`Fetched ${deals.length} deals.`);

    const metricsByMonthAndRep = {}; // format: "YYYY-MM_RepID"

    const getMetricsKey = (dateStr, repId) => {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return null;
      
      const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const validRepId = SALES_REPS[repId] ? String(repId) : 'UNASSIGNED';
      return `${month}_${validRepId}`;
    };

    const initializeMetrics = (key) => {
      if (!metricsByMonthAndRep[key]) {
        metricsByMonthAndRep[key] = {
          leads_count: 0,
          opportunities_count: 0,
          won_count: 0,
          invoiced_count: 0,
          lost_count: 0,
          en_cours_count: 0,
          total_revenue: 0,
          contact_deal_days: [],
          deal_close_days: []
        };
      }
    };

    // Process Contacts (Leads)
    contacts.forEach(c => {
      const createdate = c.properties.createdate;
      const ownerId = c.properties.hubspot_owner_id;
      if (!createdate) return;

      const key = getMetricsKey(createdate, ownerId);
      if (!key) return;

      initializeMetrics(key);
      metricsByMonthAndRep[key].leads_count += 1;
      
      // Also add to an 'ALL' bucket for this month
      const allKey = `${key.split('_')[0]}_ALL`;
      initializeMetrics(allKey);
      metricsByMonthAndRep[allKey].leads_count += 1;
    });

    // Create a contact lookup map for faster association calculation
    const contactMap = new Map(
      contacts
        .filter((c) => c?.id)
        .map((c) => [c.id, c.properties?.createdate])
    );

    // Process Deals
    deals.forEach(d => {
      const props = d?.properties || {};
      const createdate = props.createdate;
      const ownerId = props.hubspot_owner_id;
      const stage = props.dealstage != null ? String(props.dealstage) : '';
      const amount = parseFloat(props.amount) || 0;
      const closedate = props.closedate;

      if (!createdate) return;

      const key = getMetricsKey(createdate, ownerId);
      if (!key) return;

      const keysToUpdate = [key, `${key.split('_')[0]}_ALL`];

      keysToUpdate.forEach(k => {
        initializeMetrics(k);
        const m = metricsByMonthAndRep[k];
        
        m.opportunities_count += 1;

        let isClosed = false;

        // All closed-won stages (any pipeline), not only literal "closed won"
        if (isStageInSet(stage, invoicedStageIds)) {
          m.invoiced_count += 1;
          m.total_revenue += amount;
          isClosed = true;
        } else if (isStageInSet(stage, wonStageIds) || looksLikeWonLabel(stage)) {
          m.won_count += 1;
          m.total_revenue += amount;
          isClosed = true;
        } else if (isStageInSet(stage, lostStageIds) || looksLikeLostLabel(stage)) {
          m.lost_count += 1;
          isClosed = true;
        } else {
          m.en_cours_count += 1;
        }

        // Time Metrics
        // Deal to Closure
        if (isClosed && closedate) {
          const dealDate = new Date(createdate);
          const closeDate = new Date(closedate);
          const diffTime = Math.abs(closeDate - dealDate);
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          m.deal_close_days.push(diffDays);
        }

        // Contact to Deal
        const associatedContacts = d.associations?.contacts?.results || [];
        if (associatedContacts.length > 0) {
          // just take the first associated contact
          const contactId = associatedContacts[0].id;
          const contactCreateDate = contactMap.get(contactId);
          if (contactCreateDate) {
            const cDate = new Date(contactCreateDate);
            const dDate = new Date(createdate);
            const diffTime = Math.abs(dDate - cDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            m.contact_deal_days.push(diffDays);
          }
        }
      });
    });

    // Prepare DB Records
    const recordsToUpsert = Object.entries(metricsByMonthAndRep).map(([key, data]) => {
      const [month, sales_rep_id] = key.split('_');

      const avg_contact_to_deal = data.contact_deal_days.length > 0 
        ? data.contact_deal_days.reduce((a,b)=>a+b,0) / data.contact_deal_days.length 
        : 0;
      
      const avg_deal_to_close = data.deal_close_days.length > 0
        ? data.deal_close_days.reduce((a,b)=>a+b,0) / data.deal_close_days.length
        : 0;

      // Conversion rates
      const leadToOpp = data.leads_count > 0 ? (data.opportunities_count / data.leads_count) * 100 : 0;
      const oppToWon = data.opportunities_count > 0 ? ((data.won_count + data.invoiced_count) / data.opportunities_count) * 100 : 0;

      return {
        month,
        sales_rep_id,
        leads_count: data.leads_count,
        opportunities_count: data.opportunities_count,
        won_count: data.won_count,
        invoiced_count: data.invoiced_count,
        lost_count: data.lost_count,
        en_cours_count: data.en_cours_count,
        total_revenue: data.total_revenue,
        avg_contact_to_deal_days: Math.round(avg_contact_to_deal * 10) / 10,
        avg_deal_to_closure_days: Math.round(avg_deal_to_close * 10) / 10,
        conversion_rates: {
          lead_to_opp_percent: Math.round(leadToOpp * 10) / 10,
          opp_to_won_percent: Math.round(oppToWon * 10) / 10
        },
        last_updated: new Date().toISOString()
      };
    });

    // Filter to only Feb 2026 onwards
    const filteredRecords = recordsToUpsert.filter(r => r.month >= '2026-02');

    return filteredRecords;

  } catch (error) {
    console.error("Error processing HubSpot Funnel Data:", error);
    throw error;
  }
};

export const fetchFunnelCacheFromDB = async (month = 'ALL', repId = 'ALL') => {
  let query = supabase.from('hubspot_funnel_cache').select('*');
  
  if (month !== 'ALL') {
    query = query.eq('month', month);
  }
  
  if (repId !== 'ALL') {
    query = query.eq('sales_rep_id', repId);
  } else {
    query = query.eq('sales_rep_id', 'ALL');
  }

  const { data, error } = await query;
  if (error) throw error;
  
  // Aggregate if multiple months are returned for 'ALL'
  if (month === 'ALL' && data.length > 0) {
    const aggregated = data.reduce((acc, row) => {
      acc.leads_count += row.leads_count;
      acc.opportunities_count += row.opportunities_count;
      acc.won_count += row.won_count;
      acc.invoiced_count += row.invoiced_count;
      acc.lost_count += row.lost_count;
      acc.en_cours_count += row.en_cours_count;
      acc.total_revenue += row.total_revenue;
      return acc;
    }, {
      leads_count: 0, opportunities_count: 0, won_count: 0, invoiced_count: 0, 
      lost_count: 0, en_cours_count: 0, total_revenue: 0,
      avg_contact_to_deal_days: data[0].avg_contact_to_deal_days, // Simplification
      avg_deal_to_closure_days: data[0].avg_deal_to_closure_days
    });
    
    // Recalculate conversion rates for aggregated data
    aggregated.conversion_rates = {
      lead_to_opp_percent: aggregated.leads_count > 0 ? Math.round((aggregated.opportunities_count / aggregated.leads_count) * 100 * 10)/10 : 0,
      opp_to_won_percent: aggregated.opportunities_count > 0 ? Math.round(((aggregated.won_count + aggregated.invoiced_count) / aggregated.opportunities_count) * 100 * 10)/10 : 0
    };
    
    return [aggregated];
  }
  
  return data;
};

export const getAvailableMonths = async () => {
  const { data, error } = await supabase.from('hubspot_funnel_cache').select('month').neq('month', 'ALL');
  if (error) throw error;
  
  const uniqueMonths = [...new Set(data.map(d => d.month))].sort().reverse();
  return uniqueMonths;
};
/**
 * Map HubSpot owner id → display name (sales team).
 * First token is used as margin "closer" (matches commercial_closers).
 */
export const HUBSPOT_SALES_REPS = SALES_REPS;

/**
 * Resolve margin closer from the HubSpot contact owner (propriétaire du contact).
 * Returns first name when known in SALES_REPS, else owner firstName from Owners API.
 * @param {string|number} contactId
 * @returns {Promise<string|null>}
 */
export async function resolveCloserFromContactOwner(contactId) {
  const id = contactId != null ? String(contactId).trim() : '';
  if (!id) return null;

  try {
    const contact = await invokeHubSpotProxy(
      `/crm/v3/objects/contacts/${encodeURIComponent(id)}?properties=hubspot_owner_id`
    );
    const ownerId = contact?.properties?.hubspot_owner_id
      ? String(contact.properties.hubspot_owner_id)
      : '';
    if (!ownerId) return null;

    if (SALES_REPS[ownerId]) {
      const full = SALES_REPS[ownerId];
      return full.split(/\s+/)[0] || full;
    }

    try {
      const owner = await invokeHubSpotProxy(`/crm/v3/owners/${encodeURIComponent(ownerId)}`);
      const first = owner?.firstName || owner?.first_name || '';
      const last = owner?.lastName || owner?.last_name || '';
      const name = `${first} ${last}`.trim();
      if (first) return first;
      return name || null;
    } catch {
      return null;
    }
  } catch (err) {
    console.warn('[HubSpot] resolveCloserFromContactOwner failed:', err?.message || err);
    return null;
  }
}


/**
 * Fetch a HubSpot invoice by id and resolve HTVA (excl. VAT).
 * @param {string|number} invoiceId
 * @returns {Promise<{
 *   id: string,
 *   number: string|null,
 *   amountHt: number|null,
 *   amountTtc: number|null,
 *   taxesTotal: number|null,
 *   amountSource: string|null,
 *   currency: string,
 *   status: string|null,
 * }|null>}
 */
export async function fetchHubSpotInvoiceById(invoiceId) {
  const id = invoiceId != null ? String(invoiceId).trim() : '';
  if (!id) return null;

  const qs = HUBSPOT_INVOICE_AMOUNT_PROPERTIES.map(encodeURIComponent).join(',');
  const raw = await invokeHubSpotProxy(
    `/crm/v3/objects/invoices/${encodeURIComponent(id)}?properties=${qs}`
  );
  if (!raw?.id && !raw?.properties) return null;

  const props = raw.properties || {};
  const resolved = resolveInvoiceAmountHt(props);
  return {
    id: String(raw.id || props.hs_object_id || id),
    number:
      props.hs_number ||
      props.hs_invoice_number ||
      props.hs_title ||
      null,
    amountHt: resolved.amountHt,
    amountTtc: resolved.amountTtc,
    taxesTotal: resolved.taxesTotal,
    amountSource: resolved.source,
    currency: props.hs_currency || 'EUR',
    status: props.hs_invoice_status || null,
  };
}

/**
 * Re-fetch HubSpot invoice HT and persist to projects.hubspot_invoice_amount.
 * Self-heals rows that still store TTC from before v1.5.6.
 * On HubSpot failure, returns the project unchanged (caller keeps stored amount).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {Record<string, unknown>|null|undefined} project
 * @returns {Promise<Record<string, unknown>|null|undefined>}
 */
export async function refreshProjectInvoiceAmountHt(supabaseClient, project) {
  if (!project?.hubspot_invoice_id) return project;

  let invoice;
  try {
    invoice = await fetchHubSpotInvoiceById(project.hubspot_invoice_id);
  } catch (err) {
    console.warn(
      '[HubSpot] refreshProjectInvoiceAmountHt fetch failed:',
      err?.message || err
    );
    return project;
  }
  if (!invoice) return project;

  const nextAmount = invoice.amountHt;
  // Only persist when we resolved a real HT — never write null over a stored value
  // if HubSpot omitted pre-tax (would wipe CA). Still merge metadata when HT known.
  if (nextAmount == null) {
    console.warn(
      '[HubSpot] invoice',
      project.hubspot_invoice_id,
      'has no resolvable HT (pre_tax / billed−tax); keeping stored amount'
    );
    return project;
  }

  const prevAmount =
    project.hubspot_invoice_amount === '' || project.hubspot_invoice_amount == null
      ? null
      : Number(project.hubspot_invoice_amount);
  const amountChanged =
    prevAmount == null || !Number.isFinite(prevAmount) || prevAmount !== nextAmount;
  const numberChanged =
    invoice.number &&
    String(invoice.number) !== String(project.hubspot_invoice_number || '');
  const statusChanged =
    invoice.status &&
    String(invoice.status) !== String(project.hubspot_invoice_status || '');
  const currencyChanged =
    invoice.currency &&
    String(invoice.currency) !== String(project.hubspot_invoice_currency || '');

  const patched = {
    ...project,
    hubspot_invoice_amount: nextAmount,
    hubspot_invoice_number: invoice.number || project.hubspot_invoice_number || null,
    hubspot_invoice_currency: invoice.currency || project.hubspot_invoice_currency || 'EUR',
    hubspot_invoice_status: invoice.status || project.hubspot_invoice_status || null,
  };

  if (!project.id) return patched;
  if (!amountChanged && !numberChanged && !statusChanged && !currencyChanged) {
    return patched;
  }

  try {
    const { data, error } = await supabaseClient
      .from('projects')
      .update({
        hubspot_invoice_amount: nextAmount,
        hubspot_invoice_number: patched.hubspot_invoice_number,
        hubspot_invoice_currency: patched.hubspot_invoice_currency,
        hubspot_invoice_status: patched.hubspot_invoice_status,
      })
      .eq('id', project.id)
      .select(
        'id, hubspot_invoice_id, hubspot_invoice_number, hubspot_invoice_amount, hubspot_invoice_currency, hubspot_invoice_status'
      )
      .maybeSingle();
    if (error) throw error;
    if (data) {
      return { ...project, ...data };
    }
  } catch (err) {
    console.warn(
      '[HubSpot] refreshProjectInvoiceAmountHt persist failed:',
      err?.message || err
    );
  }
  return patched;
}

/**
 * Active HubSpot product catalog (portal product library).
 * Used as fallback for Suivi task picker when no contact line-items are available.
 */
export async function fetchHubSpotProductCatalog({ limit = 100 } = {}) {
  const props = ['name', 'hs_sku', 'price', 'hs_status', 'hs_product_type'].join(',');
  const results = [];
  let after = null;
  do {
    const qs = new URLSearchParams({
      limit: String(Math.min(limit - results.length, 100)),
      properties: props,
    });
    if (after) qs.set('after', after);
    const data = await invokeHubSpotProxy(`/crm/v3/objects/products?${qs.toString()}`);
    const batch = Array.isArray(data?.results) ? data.results : [];
    for (const row of batch) {
      const name = row?.properties?.name?.trim();
      const status = String(row?.properties?.hs_status || '').toLowerCase();
      if (!name) continue;
      if (status && status !== 'active') continue;
      results.push({
        id: String(row.id),
        name,
        sku: row?.properties?.hs_sku || null,
        source: 'product',
      });
    }
    after = data?.paging?.next?.after || null;
  } while (after && results.length < limit);
  return results;
}

/**
 * Service labels from HubSpot deal property `type_of_service` (enumeration).
 * Readable with deals scopes — works even when line_items / products scopes are missing.
 */
export async function fetchHubSpotTypeOfServiceCatalog() {
  const prop = await invokeHubSpotProxy('/crm/v3/properties/deals/type_of_service');
  const options = Array.isArray(prop?.options) ? prop.options : [];
  return options
    .map((opt) => {
      const name = String(opt?.label || opt?.value || '').trim();
      if (!name) return null;
      return {
        id: String(opt?.value || name),
        name,
        source: 'type_of_service',
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

const associationObjectIds = (payload) =>
  (Array.isArray(payload?.results) ? payload.results : [])
    .map((r) => String(r.toObjectId || r.id || '').trim())
    .filter(Boolean);

const splitMultiSelect = (raw) =>
  String(raw || '')
    .split(/[;|,]/)
    .map((s) => s.trim())
    .filter(Boolean);

/** Same ranking as surface: closedate → createdate → hs_lastmodifieddate. */
export const rankHubSpotDealRecency = (deal) => {
  const props = deal?.properties || {};
  const close = Date.parse(props.closedate || '') || 0;
  const created = Date.parse(props.createdate || '') || 0;
  const modified = Date.parse(props.hs_lastmodifieddate || '') || 0;
  return close || created || modified;
};

/**
 * Batch-read deals and return them sorted newest-first (closedate → createdate).
 */
async function batchReadDealsRanked(dealIds, extraProperties = []) {
  const chunk = (dealIds || []).slice(0, 100);
  if (!chunk.length) return [];
  const properties = [
    'dealname',
    'closedate',
    'createdate',
    'hs_lastmodifieddate',
    ...extraProperties,
  ];
  const batch = await invokeHubSpotProxy('/crm/v3/objects/deals/batch/read', 'POST', {
    properties: [...new Set(properties)],
    inputs: chunk.map((did) => ({ id: did })),
  });
  const deals = Array.isArray(batch?.results) ? batch.results : [];
  deals.sort((a, b) => rankHubSpotDealRecency(b) - rankHubSpotDealRecency(a));
  return deals;
}

/**
 * Read line-item labels (name / description / sku) for a parent object.
 * Returns { lineIds, services, readFailed }.
 */
async function readParentLineItemServices(parentType, parentId, { fromLatestDeal = false } = {}) {
  const assoc = await invokeHubSpotProxy(
    `/crm/v3/objects/${parentType}/${encodeURIComponent(parentId)}/associations/line_items`
  );
  const lineIds = associationObjectIds(assoc);
  if (!lineIds.length) {
    return { lineIds: [], services: [], readFailed: false };
  }
  const chunk = lineIds.slice(0, 100);
  const batch = await invokeHubSpotProxy('/crm/v3/objects/line_items/batch/read', 'POST', {
    properties: ['name', 'hs_product_id', 'description', 'hs_sku'],
    inputs: chunk.map((lid) => ({ id: lid })),
  });
  const services = [];
  for (const row of Array.isArray(batch?.results) ? batch.results : []) {
    const name = String(
      row?.properties?.name ||
        row?.properties?.description ||
        row?.properties?.hs_sku ||
        ''
    ).trim();
    if (!name) continue;
    services.push({
      name,
      source: 'line_item',
      id: row?.id ? String(row.id) : undefined,
      sku: row?.properties?.hs_sku || null,
      fromLatestDeal: Boolean(fromLatestDeal),
      parentType,
      parentId: String(parentId),
    });
  }
  return { lineIds, services, readFailed: false };
}

/**
 * Distinct service names for a contact:
 * 1) preferred: line items on the latest deal (closedate → createdate, same as surface)
 * 2) then: line items on other deals / quotes / invoices
 * 3) fallback: deal `type_of_service` multi-select (deals scopes only)
 *
 * Returns { services, source, meta } so callers can surface empty-state reasons.
 */
export async function fetchHubSpotContactServiceNames(contactId, { maxParents = 8 } = {}) {
  const id = contactId != null ? String(contactId).trim() : '';
  if (!id) {
    return { services: [], source: 'empty', meta: { reason: 'no_contact' } };
  }

  const names = new Map(); // lower → display
  const missingScopes = new Set();
  const warnings = [];
  let lineItemIdsSeen = 0;
  let lineItemReadFailed = false;
  let dealIds = [];
  let quoteIds = [];
  let invoiceIds = [];
  let latestDealId = null;
  let latestDealName = null;
  let rankedDeals = [];

  const addService = (svc) => {
    const name = String(svc?.name || '').trim();
    if (!name) return;
    const key = name.toLowerCase();
    if (!names.has(key)) {
      names.set(key, { ...svc, name });
      return;
    }
    // Prefer keeping the latest-deal flag if a later add is also fromLatestDeal
    const prev = names.get(key);
    if (svc.fromLatestDeal && !prev.fromLatestDeal) {
      names.set(key, { ...prev, ...svc, name, fromLatestDeal: true });
    }
  };

  const noteScopeErr = (err, label) => {
    if (err instanceof HubSpotApiError && err.isMissingScopes) {
      (err.requiredScopes || []).forEach((s) => missingScopes.add(s));
      if (!err.requiredScopes?.length) {
        HUBSPOT_LINE_ITEM_READ_SCOPES.forEach((s) => missingScopes.add(s));
      }
      warnings.push(`${label}: MISSING_SCOPES`);
      return true;
    }
    warnings.push(`${label}: ${err?.message || err}`);
    return false;
  };

  // 1) Parent objects associated to contact
  try {
    const assoc = await invokeHubSpotProxy(
      `/crm/v3/objects/contacts/${encodeURIComponent(id)}/associations/deals`
    );
    // Keep more than maxParents for ranking, then pick latest + a few others
    dealIds = associationObjectIds(assoc).slice(0, 100);
  } catch (err) {
    noteScopeErr(err, 'contact→deals');
  }

  try {
    const assoc = await invokeHubSpotProxy(
      `/crm/v3/objects/contacts/${encodeURIComponent(id)}/associations/quotes`
    );
    quoteIds = associationObjectIds(assoc).slice(0, maxParents);
  } catch (err) {
    noteScopeErr(err, 'contact→quotes');
  }

  try {
    const assoc = await invokeHubSpotProxy(
      `/crm/v3/objects/contacts/${encodeURIComponent(id)}/associations/invoices`
    );
    invoiceIds = associationObjectIds(assoc).slice(0, maxParents);
  } catch (err) {
    noteScopeErr(err, 'contact→invoices');
  }

  // Rank deals (same as surface) so we prefer the latest transaction's line items
  if (dealIds.length) {
    try {
      rankedDeals = await batchReadDealsRanked(dealIds, [
        'type_of_service',
        'hs_num_of_associated_line_items',
      ]);
      if (rankedDeals.length) {
        latestDealId = rankedDeals[0]?.id ? String(rankedDeals[0].id) : null;
        latestDealName = rankedDeals[0]?.properties?.dealname || null;
      }
    } catch (err) {
      noteScopeErr(err, 'deals batch/read rank');
      rankedDeals = [];
    }
  }

  // 2a) Preferred path: line items on the latest deal
  if (latestDealId) {
    try {
      const { lineIds, services } = await readParentLineItemServices('deals', latestDealId, {
        fromLatestDeal: true,
      });
      lineItemIdsSeen += lineIds.length;
      for (const svc of services) addService(svc);
      if (services.length) {
        return {
          services: [...names.values()],
          source: 'latest_deal_line_items',
          meta: {
            dealCount: dealIds.length,
            dealId: latestDealId,
            dealName: latestDealName,
            lineItemIdsSeen,
            missingScopes: [...missingScopes],
            warnings,
          },
        };
      }
    } catch (err) {
      lineItemReadFailed = true;
      noteScopeErr(err, 'latest deal→line_items');
    }
  }

  // 2b) Other deals / quotes / invoices line items
  const otherDealIds = rankedDeals.length
    ? rankedDeals
        .slice(1, maxParents)
        .map((d) => String(d.id))
        .filter((did) => did && did !== latestDealId)
    : dealIds.filter((did) => did !== latestDealId).slice(0, maxParents - 1);

  const parents = [
    ...otherDealIds.map((d) => ({ type: 'deals', id: d })),
    ...quoteIds.map((q) => ({ type: 'quotes', id: q })),
    ...invoiceIds.map((inv) => ({ type: 'invoices', id: inv })),
  ];

  for (const parent of parents) {
    try {
      const { lineIds, services } = await readParentLineItemServices(parent.type, parent.id, {
        fromLatestDeal: false,
      });
      lineItemIdsSeen += lineIds.length;
      for (const svc of services) addService(svc);
    } catch (err) {
      // Association failures vs batch/read failures
      if (/line_items\/batch\/read|batch\/read/i.test(String(err?.message || ''))) {
        lineItemReadFailed = true;
      }
      // Also mark read failed for MISSING_SCOPES on line item reads
      if (err instanceof HubSpotApiError && err.isMissingScopes) {
        lineItemReadFailed = true;
      }
      noteScopeErr(err, `${parent.type}→line_items`);
    }
  }

  if (names.size) {
    // Latest-deal items (if any were merged later) first, then alpha
    const services = [...names.values()].sort((a, b) => {
      if (Boolean(a.fromLatestDeal) !== Boolean(b.fromLatestDeal)) {
        return a.fromLatestDeal ? -1 : 1;
      }
      return a.name.localeCompare(b.name, 'fr');
    });
    return {
      services,
      source: 'contact_line_items',
      meta: {
        dealCount: dealIds.length,
        dealId: latestDealId,
        dealName: latestDealName,
        lineItemIdsSeen,
        missingScopes: [...missingScopes],
        warnings,
      },
    };
  }

  // 3) Fallback: deal.type_of_service (readable with crm.objects.deals.read)
  if (rankedDeals.length) {
    for (const row of rankedDeals) {
      for (const svc of splitMultiSelect(row?.properties?.type_of_service)) {
        addService({
          name: svc,
          source: 'deal_type_of_service',
          id: row?.id ? String(row.id) : undefined,
        });
      }
    }
  } else if (dealIds.length) {
    try {
      const batch = await invokeHubSpotProxy('/crm/v3/objects/deals/batch/read', 'POST', {
        properties: ['dealname', 'type_of_service', 'hs_num_of_associated_line_items'],
        inputs: dealIds.slice(0, 100).map((did) => ({ id: did })),
      });
      for (const row of Array.isArray(batch?.results) ? batch.results : []) {
        for (const svc of splitMultiSelect(row?.properties?.type_of_service)) {
          addService({
            name: svc,
            source: 'deal_type_of_service',
            id: row?.id ? String(row.id) : undefined,
          });
        }
      }
    } catch (err) {
      noteScopeErr(err, 'deals batch/read type_of_service');
    }
  }

  if (names.size) {
    return {
      services: [...names.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
      source: 'deal_type_of_service',
      meta: {
        dealCount: dealIds.length,
        dealId: latestDealId,
        dealName: latestDealName,
        lineItemIdsSeen,
        lineItemReadFailed,
        missingScopes: [...missingScopes],
        warnings,
        reason:
          lineItemReadFailed && lineItemIdsSeen
            ? 'line_items_scope_fallback_type_of_service'
            : undefined,
      },
    };
  }

  let reason = 'no_services';
  if (!dealIds.length && !quoteIds.length && !invoiceIds.length) {
    reason = 'no_deals_quotes_invoices';
  } else if (lineItemIdsSeen && lineItemReadFailed) {
    reason = 'missing_line_items_scopes';
  } else if (lineItemIdsSeen === 0) {
    reason = 'no_line_items_and_no_type_of_service';
  }

  return {
    services: [],
    source: 'empty',
    meta: {
      dealCount: dealIds.length,
      dealId: latestDealId,
      dealName: latestDealName,
      lineItemIdsSeen,
      lineItemReadFailed,
      missingScopes: [...missingScopes],
      warnings,
      reason,
    },
  };
}

/**
 * Services for Suivi task picker:
 * latest-deal line-items → other contact line-items → deal type_of_service →
 * product catalog → type_of_service enum catalog.
 * Never silently swallow HubSpot MISSING_SCOPES — surface emptyReason + requiredScopes.
 */
export async function fetchHubSpotServicesForTaskPicker(contactId) {
  const requiredScopes = new Set();
  const notes = [];

  if (contactId) {
    try {
      const fromContact = await fetchHubSpotContactServiceNames(contactId);
      (fromContact.meta?.missingScopes || []).forEach((s) => requiredScopes.add(s));
      if (fromContact.services?.length) {
        return {
          services: fromContact.services,
          source: fromContact.source,
          emptyReason: null,
          requiredScopes: [...requiredScopes],
          meta: fromContact.meta || null,
        };
      }
      if (fromContact.meta?.reason) notes.push(fromContact.meta.reason);
      (fromContact.meta?.warnings || []).forEach((w) => notes.push(w));
    } catch (err) {
      if (err instanceof HubSpotApiError) {
        (err.requiredScopes || []).forEach((s) => requiredScopes.add(s));
      }
      notes.push(err?.message || String(err));
    }
  }

  // Product library (often also missing scopes on this portal)
  try {
    const catalog = await fetchHubSpotProductCatalog();
    if (catalog.length) {
      return {
        services: catalog.map((p) => ({ name: p.name, source: 'product', id: p.id })),
        source: 'product_catalog',
        emptyReason: null,
        requiredScopes: [...requiredScopes],
        meta: { notes },
      };
    }
  } catch (err) {
    if (err instanceof HubSpotApiError) {
      if (err.requiredScopes?.length) {
        err.requiredScopes.forEach((s) => requiredScopes.add(s));
      } else if (err.isMissingScopes) {
        HUBSPOT_PRODUCT_READ_SCOPES.forEach((s) => requiredScopes.add(s));
      }
    }
    notes.push(`products: ${err?.message || err}`);
  }

  // Enum catalog from deals.type_of_service — last resort that works with current token
  try {
    const enumCatalog = await fetchHubSpotTypeOfServiceCatalog();
    if (enumCatalog.length) {
      return {
        services: enumCatalog.map((p) => ({
          name: p.name,
          source: 'type_of_service',
          id: p.id,
        })),
        source: 'type_of_service_catalog',
        emptyReason: null,
        requiredScopes: [...requiredScopes],
        meta: {
          notes,
          hint: contactId
            ? 'Aucun devis/line-item lisible — catalogue type_of_service HubSpot'
            : 'Pas de contact — catalogue type_of_service HubSpot',
        },
      };
    }
  } catch (err) {
    notes.push(`type_of_service catalog: ${err?.message || err}`);
  }

  let emptyReason = 'Aucun service HubSpot trouvé — saisie libre possible.';
  if (requiredScopes.size) {
    emptyReason =
      'Scopes HubSpot manquants pour lire les line items / produits. ' +
      `Ajoutez sur l'app privée : ${[...requiredScopes].slice(0, 6).join(', ')}. ` +
      'Saisie libre possible en attendant.';
  } else if (!contactId) {
    emptyReason = 'Pas de contact HubSpot lié — saisie libre possible.';
  } else if (notes.includes('no_deals_quotes_invoices')) {
    emptyReason =
      'Contact HubSpot lié, mais aucun deal / devis / facture associé — saisie libre possible.';
  }

  return {
    services: [],
    source: 'empty',
    emptyReason,
    requiredScopes: [...requiredScopes],
    meta: { notes },
  };
}

/**
 * Internal HubSpot deal property: total_surface_in_m2 ("Total surface (in m2)").
 * Reads the most recent deal associated with the contact (by closedate, then createdate).
 * @returns {Promise<{ surfaceM2: number|null, dealId: string|null, dealName: string|null }>}
 */
export async function fetchHubSpotContactLatestDealSurface(contactId) {
  const id = contactId != null ? String(contactId).trim() : '';
  if (!id) return { surfaceM2: null, dealId: null, dealName: null };

  let dealIds = [];
  try {
    const assoc = await invokeHubSpotProxy(
      `/crm/v3/objects/contacts/${encodeURIComponent(id)}/associations/deals`
    );
    dealIds = associationObjectIds(assoc);
  } catch (err) {
    console.warn('[HubSpot] contact→deals for surface failed:', err?.message || err);
    return { surfaceM2: null, dealId: null, dealName: null };
  }
  if (!dealIds.length) return { surfaceM2: null, dealId: null, dealName: null };

  let deals = [];
  try {
    deals = await batchReadDealsRanked(dealIds, ['total_surface_in_m2', 'dealstage']);
  } catch (err) {
    console.warn('[HubSpot] deals batch read for surface failed:', err?.message || err);
    return { surfaceM2: null, dealId: null, dealName: null };
  }
  if (!deals.length) return { surfaceM2: null, dealId: null, dealName: null };

  const latest = deals[0];
  const raw = latest?.properties?.total_surface_in_m2;
  const num = raw === '' || raw == null ? null : Number(raw);
  return {
    surfaceM2: Number.isFinite(num) ? num : null,
    dealId: latest?.id ? String(latest.id) : null,
    dealName: latest?.properties?.dealname || null,
  };
}
