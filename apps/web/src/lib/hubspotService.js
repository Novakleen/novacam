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

const invokeHubSpotProxy = async (path, method = 'GET', body = null) => {
  const { data, error } = await supabase.functions.invoke('hubspot-proxy', {
    body: { path, method, body }
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
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
 * Distinct line-item / product names from a contact's associated deals (and quotes when present).
 * Prefer recent open/won deals so Suivi tasks mirror what was sold to that client.
 */
export async function fetchHubSpotContactServiceNames(contactId, { maxDeals = 8 } = {}) {
  const id = contactId != null ? String(contactId).trim() : '';
  if (!id) return [];

  const names = new Map(); // lower → display

  const addName = (raw, source) => {
    const name = String(raw || '').trim();
    if (!name) return;
    const key = name.toLowerCase();
    if (!names.has(key)) names.set(key, { name, source });
  };

  // 1) Deals associated to contact
  let dealIds = [];
  try {
    const assoc = await invokeHubSpotProxy(
      `/crm/v3/objects/contacts/${encodeURIComponent(id)}/associations/deals`
    );
    dealIds = (Array.isArray(assoc?.results) ? assoc.results : [])
      .map((r) => String(r.toObjectId || r.id || ''))
      .filter(Boolean)
      .slice(0, maxDeals);
  } catch (err) {
    console.warn('[HubSpot] contact→deals associations failed:', err?.message || err);
  }

  // 2) Quotes associated to contact (best-effort)
  let quoteIds = [];
  try {
    const assoc = await invokeHubSpotProxy(
      `/crm/v3/objects/contacts/${encodeURIComponent(id)}/associations/quotes`
    );
    quoteIds = (Array.isArray(assoc?.results) ? assoc.results : [])
      .map((r) => String(r.toObjectId || r.id || ''))
      .filter(Boolean)
      .slice(0, maxDeals);
  } catch {
    // Quotes association may lack scopes — ignore
  }

  const parentIds = [
    ...dealIds.map((d) => ({ type: 'deals', id: d })),
    ...quoteIds.map((q) => ({ type: 'quotes', id: q })),
  ];

  for (const parent of parentIds) {
    let lineIds = [];
    try {
      const assoc = await invokeHubSpotProxy(
        `/crm/v3/objects/${parent.type}/${encodeURIComponent(parent.id)}/associations/line_items`
      );
      lineIds = (Array.isArray(assoc?.results) ? assoc.results : [])
        .map((r) => String(r.toObjectId || r.id || ''))
        .filter(Boolean);
    } catch (err) {
      console.warn(`[HubSpot] ${parent.type}→line_items failed:`, err?.message || err);
      continue;
    }
    if (!lineIds.length) continue;

    // Batch read line items (max 100)
    const chunk = lineIds.slice(0, 100);
    try {
      const batch = await invokeHubSpotProxy('/crm/v3/objects/line_items/batch/read', 'POST', {
        properties: ['name', 'hs_product_id', 'description'],
        inputs: chunk.map((lid) => ({ id: lid })),
      });
      for (const row of Array.isArray(batch?.results) ? batch.results : []) {
        addName(row?.properties?.name, 'line_item');
      }
    } catch (err) {
      console.warn('[HubSpot] line_items batch read failed:', err?.message || err);
    }
  }

  return [...names.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

/**
 * Services for Suivi task picker: contact line-items first, then product catalog fallback.
 */
export async function fetchHubSpotServicesForTaskPicker(contactId) {
  const fromContact = contactId
    ? await fetchHubSpotContactServiceNames(contactId).catch(() => [])
    : [];
  if (fromContact.length) {
    return { services: fromContact, source: 'contact_line_items' };
  }
  const catalog = await fetchHubSpotProductCatalog().catch(() => []);
  return {
    services: catalog.map((p) => ({ name: p.name, source: 'product', id: p.id })),
    source: catalog.length ? 'product_catalog' : 'empty',
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
    dealIds = (Array.isArray(assoc?.results) ? assoc.results : [])
      .map((r) => String(r.toObjectId || r.id || ''))
      .filter(Boolean);
  } catch (err) {
    console.warn('[HubSpot] contact→deals for surface failed:', err?.message || err);
    return { surfaceM2: null, dealId: null, dealName: null };
  }
  if (!dealIds.length) return { surfaceM2: null, dealId: null, dealName: null };

  // Batch-read deals with surface + ranking dates (max 100)
  const chunk = dealIds.slice(0, 100);
  let deals = [];
  try {
    const batch = await invokeHubSpotProxy('/crm/v3/objects/deals/batch/read', 'POST', {
      properties: [
        'dealname',
        'closedate',
        'createdate',
        'hs_lastmodifieddate',
        'total_surface_in_m2',
        'dealstage',
      ],
      inputs: chunk.map((did) => ({ id: did })),
    });
    deals = Array.isArray(batch?.results) ? batch.results : [];
  } catch (err) {
    console.warn('[HubSpot] deals batch read for surface failed:', err?.message || err);
    return { surfaceM2: null, dealId: null, dealName: null };
  }
  if (!deals.length) return { surfaceM2: null, dealId: null, dealName: null };

  const rank = (d) => {
    const props = d.properties || {};
    const close = Date.parse(props.closedate || '') || 0;
    const created = Date.parse(props.createdate || '') || 0;
    const modified = Date.parse(props.hs_lastmodifieddate || '') || 0;
    // Prefer closedate when present, else createdate, else lastmodified
    return close || created || modified;
  };

  deals.sort((a, b) => rank(b) - rank(a));
  const latest = deals[0];
  const raw = latest?.properties?.total_surface_in_m2;
  const num = raw === '' || raw == null ? null : Number(raw);
  return {
    surfaceM2: Number.isFinite(num) ? num : null,
    dealId: latest?.id ? String(latest.id) : null,
    dealName: latest?.properties?.dealname || null,
  };
}
