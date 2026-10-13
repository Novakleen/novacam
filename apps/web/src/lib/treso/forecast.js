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
 * Signed jobs already store TTC. event_date is the calendar day; the engine
 * adds collection_delay_days. A deal with a client invoice is left out.
 */
export async function loadForecastInput(client = supabase) {
  const [settings, accounts, snapshots, commitments, invoices, bills, events, transactions, signedJobs, batches] = await Promise.all([
    client.from('treso_settings').select('*').eq('id', 1).maybeSingle(),
    client.from('treso_accounts').select('id, name, kind, include_in_cash, is_active'),
    client.from('treso_balance_snapshots').select('account_id, balance_date, balance, source, created_at'),
    client.from('treso_commitments').select('*'),
    client.from('treso_client_invoices').select('id, invoice_number, client_name, invoice_date, due_date, amount_ttc, amount_ht, bank_paid_amount, paid_at, expected_date_override, excluded_from_cash, hubspot_deal_id, project_id, accountable_status'),
    client.from('treso_supplier_bills').select('id, supplier_name, invoice_date, booking_date, due_date, due_date_source, amount_ttc, is_paid, excluded_from_cash, replaces_commitment_id'),
    client.from('treso_cash_events').select('id, event_date, label, amount, direction, excluded_from_cash'),
    client.from('treso_bank_transactions').select('id, account_id, booking_date, amount, counterparty_name, communication, excluded_from_cash, is_internal_transfer'),
    client.from('treso_signed_jobs').select('hubspot_deal_id, label, client_name, amount_ttc, event_date'),
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
  const dealIds = new Set(invoiceRows.filter((row) => row.hubspot_deal_id).map((row) => String(row.hubspot_deal_id)));
  const jobs = unwrap(signedJobs).map((row) => ({
    id: row.hubspot_deal_id,
    hubspot_deal_id: row.hubspot_deal_id,
    label: row.label || row.client_name,
    client_name: row.client_name,
    end_date: row.event_date,
    amount_ttc: row.amount_ttc,
    invoiced: Boolean(row.hubspot_deal_id) && dealIds.has(String(row.hubspot_deal_id)),
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
