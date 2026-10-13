import { supabase } from '@/lib/customSupabaseClient';
import { foldValidatedPayment } from '../../../../../supabase/functions/_shared/tresoMatch.js';

const QUEUE_COLUMNS = 'id, booking_date, amount, counterparty_name, communication, client_invoice_id, match_status, treso_client_invoices(id, invoice_number, client_name, amount_ttc, hubspot_invoice_id, bank_paid_amount, paid_at)';

export async function listProposedMatches() {
  const { data, error } = await supabase
    .from('treso_bank_transactions')
    .select(QUEUE_COLUMNS)
    .eq('match_status', 'a_valider')
    .order('booking_date', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function refreshInvoicePaid(invoice, paymentAmount, paymentDate) {
  if (!invoice?.id) return;
  const next = foldValidatedPayment({
    amountTtc: invoice.amount_ttc,
    bankPaidAmount: invoice.bank_paid_amount,
    paidAt: invoice.paid_at,
    paymentAmount,
    paymentDate,
  });
  const { error } = await supabase.from('treso_client_invoices').update({
    bank_paid_amount: next.bank_paid_amount,
    paid_at: next.paid_at,
  }).eq('id', invoice.id);
  if (error) throw error;
  if (!invoice.hubspot_invoice_id) return;
  if (next.paid) {
    const { error: projectError } = await supabase
      .from('project_invoices')
      .update({ status: 'paid' })
      .eq('hubspot_invoice_id', invoice.hubspot_invoice_id);
    if (projectError) throw projectError;
    return;
  }
  const { error: projectError } = await supabase
    .from('project_invoices')
    .update({ status: 'open' })
    .eq('hubspot_invoice_id', invoice.hubspot_invoice_id)
    .eq('status', 'paid');
  if (projectError) throw projectError;
}

export async function confirmProposedMatch(row) {
  const { error } = await supabase
    .from('treso_bank_transactions')
    .update({ match_status: 'valide', match_method: 'montant' })
    .eq('id', row.id)
    .eq('match_status', 'a_valider');
  if (error) throw error;
  await refreshInvoicePaid(row.treso_client_invoices, row.amount, row.booking_date);
}

export async function rejectProposedMatch(row) {
  const { error } = await supabase
    .from('treso_bank_transactions')
    .update({ match_status: 'rejete', match_method: 'rejete' })
    .eq('id', row.id)
    .eq('match_status', 'a_valider');
  if (error) throw error;
}
