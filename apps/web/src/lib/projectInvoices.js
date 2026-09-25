/**
 * Multiple HubSpot invoices per chantier (v1.6.20).
 *
 * Source of truth: public.project_invoices (1 project → N HubSpot invoices).
 * Legacy single-link columns projects.hubspot_invoice_* are kept and mirrored
 * to the FIRST linked invoice by a DB trigger (backward compat / cached clients).
 *
 * All amounts are HTVA (excl. VAT) — see hubspotInvoiceAmount.js.
 */
import { fetchHubSpotInvoiceById } from '@/lib/hubspotService';

export const PROJECT_INVOICE_FIELDS =
  'id, project_id, hubspot_invoice_id, invoice_number, amount_ht, currency, status, invoice_date, position, created_at, updated_at';

function toAmount(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

/** Virtual row built from legacy projects.hubspot_invoice_* (no project_invoices row yet). */
export function legacyInvoiceRow(project) {
  if (!project?.hubspot_invoice_id) return null;
  return {
    id: null,
    project_id: project.id || null,
    hubspot_invoice_id: String(project.hubspot_invoice_id),
    invoice_number: project.hubspot_invoice_number || null,
    amount_ht: toAmount(project.hubspot_invoice_amount),
    currency: project.hubspot_invoice_currency || 'EUR',
    status: project.hubspot_invoice_status || null,
    invoice_date: null,
    position: 0,
    legacy: true,
  };
}

/**
 * Linked invoices for a project, ordered. Falls back to the legacy single link
 * when the join table has no rows (e.g. link written by a pre-1.6.20 client).
 * With `backfill: true` (admin), that legacy link is persisted into project_invoices.
 */
export async function fetchProjectInvoices(supabase, project, { backfill = false } = {}) {
  if (!project?.id) {
    const legacy = legacyInvoiceRow(project);
    return legacy ? [legacy] : [];
  }
  const { data, error } = await supabase
    .from('project_invoices')
    .select(PROJECT_INVOICE_FIELDS)
    .eq('project_id', project.id)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) {
    console.warn('[projectInvoices] fetch failed:', error.message);
    const legacy = legacyInvoiceRow(project);
    return legacy ? [legacy] : [];
  }
  const rows = data || [];
  if (rows.length) return rows;

  const legacy = legacyInvoiceRow(project);
  if (!legacy) return [];
  if (backfill) {
    try {
      const inserted = await addProjectInvoice(supabase, project.id, {
        id: legacy.hubspot_invoice_id,
        number: legacy.invoice_number,
        amount: legacy.amount_ht,
        currency: legacy.currency,
        status: legacy.status,
      });
      if (inserted) return [inserted];
    } catch (err) {
      console.warn('[projectInvoices] legacy backfill failed:', err?.message || err);
    }
  }
  return [legacy];
}

/**
 * Link a HubSpot invoice to a project (idempotent on project+invoice).
 * @param {{ id: string|number, number?: string|null, amount?: number|null, amountHt?: number|null, currency?: string|null, status?: string|null, invoiceDate?: string|null }} invoice
 */
export async function addProjectInvoice(supabase, projectId, invoice) {
  if (!projectId || invoice?.id == null || String(invoice.id).trim() === '') {
    throw new Error('Missing project or invoice id');
  }
  const { data: existing } = await supabase
    .from('project_invoices')
    .select('position')
    .eq('project_id', projectId)
    .order('position', { ascending: false })
    .limit(1);
  const nextPos = existing?.length ? (Number(existing[0].position) || 0) + 1 : 0;

  const amount = toAmount(invoice.amountHt ?? invoice.amount);
  const { data: auth } = await supabase.auth.getUser().catch(() => ({ data: null }));
  const row = {
    project_id: projectId,
    hubspot_invoice_id: String(invoice.id).trim(),
    invoice_number: invoice.number ? String(invoice.number) : null,
    amount_ht: amount,
    currency: invoice.currency || 'EUR',
    status: invoice.status || null,
    invoice_date: invoice.invoiceDate || null,
    position: nextPos,
    created_by: auth?.user?.id || null,
  };
  const { data, error } = await supabase
    .from('project_invoices')
    .upsert(row, { onConflict: 'project_id,hubspot_invoice_id', ignoreDuplicates: true })
    .select(PROJECT_INVOICE_FIELDS);
  if (error) throw error;
  if (data?.length) return data[0];
  // Already linked (ignoreDuplicates) → return existing row
  const { data: dup } = await supabase
    .from('project_invoices')
    .select(PROJECT_INVOICE_FIELDS)
    .eq('project_id', projectId)
    .eq('hubspot_invoice_id', row.hubspot_invoice_id)
    .maybeSingle();
  return dup || null;
}

/** Unlink one invoice (by project_invoices.id, or legacy hubspot id when row is virtual). */
export async function removeProjectInvoice(supabase, projectId, invoiceRow) {
  if (invoiceRow?.id) {
    const { error } = await supabase.from('project_invoices').delete().eq('id', invoiceRow.id);
    if (error) throw error;
    return;
  }
  if (invoiceRow?.legacy && projectId) {
    const { error } = await supabase
      .from('projects')
      .update({
        hubspot_invoice_id: null,
        hubspot_invoice_number: null,
        hubspot_invoice_amount: null,
        hubspot_invoice_currency: null,
        hubspot_invoice_status: null,
      })
      .eq('id', projectId);
    if (error) throw error;
  }
}

/** Unlink every invoice of a project (e.g. when the HubSpot contact is cleared). */
export async function removeAllProjectInvoices(supabase, projectId) {
  if (!projectId) return;
  const { error } = await supabase.from('project_invoices').delete().eq('project_id', projectId);
  if (error) throw error;
}

/**
 * Re-fetch HT (+ number/status/date) of every linked invoice from HubSpot and persist
 * changes. Never overwrites a stored HT with null. On HubSpot failure, keeps stored row.
 * @returns {Promise<Array<Record<string, unknown>>>} refreshed rows
 */
export async function refreshProjectInvoicesHt(supabase, project, rows = null) {
  const list = rows || (await fetchProjectInvoices(supabase, project, { backfill: true }));
  if (!list.length) return list;

  return Promise.all(
    list.map(async (row) => {
      let inv = null;
      try {
        inv = await fetchHubSpotInvoiceById(row.hubspot_invoice_id);
      } catch (err) {
        console.warn('[projectInvoices] HubSpot fetch failed:', row.hubspot_invoice_id, err?.message || err);
        return row;
      }
      if (!inv) return row;

      const patch = {};
      if (inv.amountHt != null && toAmount(row.amount_ht) !== inv.amountHt) {
        patch.amount_ht = inv.amountHt;
      } else if (inv.amountHt == null) {
        console.warn(
          '[projectInvoices] invoice',
          row.hubspot_invoice_id,
          'has no resolvable HT (pre_tax / billed−tax); keeping stored amount'
        );
      }
      if (inv.number && String(inv.number) !== String(row.invoice_number || '')) {
        patch.invoice_number = String(inv.number);
      }
      if (inv.status && String(inv.status) !== String(row.status || '')) patch.status = inv.status;
      if (inv.currency && String(inv.currency) !== String(row.currency || '')) {
        patch.currency = inv.currency;
      }
      if (inv.invoiceDate && inv.invoiceDate !== (row.invoice_date || null)) {
        patch.invoice_date = inv.invoiceDate;
      }
      if (!Object.keys(patch).length) return row;

      const merged = { ...row, ...patch };
      if (!row.id) {
        // Legacy virtual row: persist into legacy columns (pre-1.6.20 behavior)
        if (project?.id && row.legacy) {
          const legacyPatch = {};
          if ('amount_ht' in patch) legacyPatch.hubspot_invoice_amount = patch.amount_ht;
          if ('invoice_number' in patch) legacyPatch.hubspot_invoice_number = patch.invoice_number;
          if ('status' in patch) legacyPatch.hubspot_invoice_status = patch.status;
          if ('currency' in patch) legacyPatch.hubspot_invoice_currency = patch.currency;
          if (Object.keys(legacyPatch).length) {
            await supabase.from('projects').update(legacyPatch).eq('id', project.id);
          }
        }
        return merged;
      }
      try {
        const { data, error } = await supabase
          .from('project_invoices')
          .update(patch)
          .eq('id', row.id)
          .select(PROJECT_INVOICE_FIELDS)
          .maybeSingle();
        if (error) throw error;
        return data || merged;
      } catch (err) {
        console.warn('[projectInvoices] persist failed:', err?.message || err);
        return merged;
      }
    })
  );
}

/** Sum of HT amounts (null when no invoice has a usable HT). */
export function sumProjectInvoicesHt(rows) {
  let sum = 0;
  let any = false;
  for (const r of rows || []) {
    const v = toAmount(r.amount_ht);
    if (v != null) {
      sum += v;
      any = true;
    }
  }
  return any ? roundMoney(sum) : null;
}

/** Margin dossier `invoices` entries built from linked rows (HT > 0 only). */
export function buildDossierInvoicesFromRows(rows) {
  return (rows || [])
    .map((r) => ({ r, amount: toAmount(r.amount_ht) }))
    .filter(({ amount }) => amount != null && amount > 0)
    .map(({ r, amount }) => ({
      ref: r.invoice_number || r.hubspot_invoice_id || 'HubSpot',
      caHt: roundMoney(amount),
      source: 'hubspot',
      hubspot_invoice_id: r.hubspot_invoice_id || null,
      invoice_date: r.invoice_date || null,
      status: r.status || null,
    }));
}

/**
 * Fingerprint fragment for linked invoices. With exactly one invoice this is
 * identical to the pre-1.6.20 `hs:<id>:<amount>` so existing dossiers stay fresh.
 */
export function invoicesFingerprintPart(rows) {
  const list = (rows || []).filter((r) => r?.hubspot_invoice_id);
  if (!list.length) return 'hs::';
  if (list.length === 1) {
    const r = list[0];
    return `hs:${r.hubspot_invoice_id}:${r.amount_ht ?? ''}`;
  }
  return (
    'hs:' +
    list
      .map((r) => `${r.hubspot_invoice_id}:${r.amount_ht ?? ''}`)
      .sort()
      .join(';')
  );
}
