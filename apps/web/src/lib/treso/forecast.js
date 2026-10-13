import { supabase } from '@/lib/customSupabaseClient';

export {
  advanceCommitments,
  classifyImportedBill,
  formatBrusselsDateTime,
  presentLastImport,
  projectTreasury,
  projectWhatIf,
  resolveSupplierDueDate,
  seasonalityFromHistory,
  todayInBrussels,
} from '../../../../../supabase/functions/_shared/tresoForecast.js';

function unwrap(result) {
  if (result.error) throw result.error;
  return result.data || [];
}

/**
 * Read the Admin-visible treasury tables and shape them for projectTreasury.
 * Quote amounts are passed as HT; the engine applies the TTC ratio.
 */
export async function loadForecastInput(client = supabase) {
  const [settings, accounts, snapshots, commitments, invoices, bills, events, transactions, links, batches] = await Promise.all([
    client.from('treso_settings').select('*').eq('id', 1).maybeSingle(),
    client.from('treso_accounts').select('id, name, kind, include_in_cash, is_active'),
    client.from('treso_balance_snapshots').select('account_id, balance_date, balance, source, created_at'),
    client.from('treso_commitments').select('*'),
    client.from('treso_client_invoices').select('id, invoice_number, client_name, invoice_date, due_date, amount_ttc, amount_ht, bank_paid_amount, paid_at, expected_date_override, excluded_from_cash, hubspot_deal_id, project_id, accountable_status'),
    client.from('treso_supplier_bills').select('id, supplier_name, invoice_date, booking_date, due_date, due_date_source, amount_ttc, is_paid, excluded_from_cash, replaces_commitment_id'),
    client.from('treso_cash_events').select('id, event_date, label, amount, direction, excluded_from_cash'),
    client.from('treso_bank_transactions').select('id, account_id, booking_date, amount, counterparty_name, communication, excluded_from_cash, is_internal_transfer'),
    client.from('treso_calendar_links').select('id, project_id, hubspot_deal_id, status, projects(google_calendar_end, hubspot_quote_amount)'),
    client.from('treso_import_batches').select('report, created_at').eq('kind', 'accountable_xlsx').order('created_at', { ascending: false }).limit(30),
  ]);
  if (settings.error) throw settings.error;
  if (batches.error) throw batches.error;
  let facturesMinDate = null;
  for (const batch of batches.data || []) {
    const min = batch.report?.factures_date_min;
    if (min) {
      facturesMinDate = String(min).slice(0, 10);
      break;
    }
  }
  const invoiceRows = unwrap(invoices);
  const dealIds = new Set(invoiceRows.filter((row) => !row.excluded_from_cash && row.hubspot_deal_id).map((row) => row.hubspot_deal_id));
  const projectIds = new Set(invoiceRows.filter((row) => !row.excluded_from_cash && row.project_id).map((row) => row.project_id));
  const jobs = unwrap(links).map((link) => ({
    id: link.id,
    hubspot_deal_id: link.hubspot_deal_id,
    project_id: link.project_id,
    end_date: link.projects?.google_calendar_end || null,
    amount_ht: link.projects?.hubspot_quote_amount ?? null,
    link_status: link.status,
    invoiced: dealIds.has(link.hubspot_deal_id) || projectIds.has(link.project_id),
  }));
  return {
    settings: settings.data || {},
    accounts: unwrap(accounts),
    snapshots: unwrap(snapshots),
    commitments: unwrap(commitments),
    invoices: invoiceRows,
    supplierBills: unwrap(bills),
    cashEvents: unwrap(events),
    transactions: unwrap(transactions),
    jobs,
    facturesMinDate,
  };
}
