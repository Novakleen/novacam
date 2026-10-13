import { supabase, supabaseAnonKey, supabaseUrl } from '@/lib/customSupabaseClient';

const BUCKET = 'treso-supplier-invoices';

const REVIEW_COLUMNS = [
  'id',
  'bill_id',
  'pdf_path',
  'file_name',
  'supplier_name',
  'invoice_number',
  'invoice_date',
  'amount_ttc',
  'proposed_due_date',
  'proposed_source',
  'payment_terms',
  'confidence',
  'reason',
  'status',
  'treso_supplier_bills(id, supplier_name, amount_ttc, due_date, invoice_number)',
].join(', ');

function safeName(name) {
  const base = String(name || 'facture.pdf').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80);
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
}

function iso(value) {
  return value ? String(value).slice(0, 10) : '';
}

export async function uploadSupplierPdfs(files, userId) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) {
    const error = new Error('auth');
    error.status = 401;
    throw error;
  }
  const owner = String(userId || 'admin').replace(/[^A-Za-z0-9-]/g, '');
  const paths = [];
  for (const file of files) {
    const path = `${owner}/${Date.now()}-${Math.random().toString(16).slice(2, 8)}-${safeName(file.name)}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      contentType: 'application/pdf',
      upsert: false,
    });
    if (error) {
      const wrapped = new Error(error.message || 'upload');
      wrapped.status = Number(error.statusCode) || 400;
      throw wrapped;
    }
    paths.push(path);
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/treso-pdf-extract`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ paths }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.message || body.error || 'extract');
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

export async function listSupplierDueReviews() {
  const { data, error } = await supabase
    .from('treso_supplier_pdf_reviews')
    .select(REVIEW_COLUMNS)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function listOpenSupplierBills() {
  const { data, error } = await supabase
    .from('treso_supplier_bills')
    .select('id, supplier_name, invoice_number, invoice_date, amount_ttc, due_date, due_date_source, pdf_path, is_paid')
    .eq('is_paid', false)
    .order('due_date', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function confirmSupplierDueReview({ review, dueDate, billId }) {
  const targetId = billId || review.bill_id;
  if (!targetId || !dueDate) throw new Error('missing');
  const proposed = iso(review.proposed_due_date);
  const source = !proposed || dueDate !== proposed
    ? 'manuel'
    : (review.proposed_source === 'estimee' ? 'estimee' : 'pdf');
  const { data: bill, error: readError } = await supabase
    .from('treso_supplier_bills')
    .select('invoice_number, invoice_date')
    .eq('id', targetId)
    .maybeSingle();
  if (readError) throw readError;
  const patch = {
    due_date: dueDate,
    due_date_source: source,
    pdf_path: review.pdf_path,
    extraction_confidence: review.confidence,
    payment_terms: review.payment_terms,
  };
  if (!bill?.invoice_number && review.invoice_number) patch.invoice_number = review.invoice_number;
  if (!bill?.invoice_date && review.invoice_date) patch.invoice_date = review.invoice_date;
  const { error } = await supabase.from('treso_supplier_bills').update(patch).eq('id', targetId);
  if (error) throw error;
  const { error: reviewError } = await supabase
    .from('treso_supplier_pdf_reviews')
    .update({ status: 'applied', bill_id: targetId })
    .eq('id', review.id)
    .eq('status', 'pending');
  if (reviewError) throw reviewError;
}

export async function dismissSupplierDueReview(id) {
  const { error } = await supabase
    .from('treso_supplier_pdf_reviews')
    .update({ status: 'dismissed' })
    .eq('id', id)
    .eq('status', 'pending');
  if (error) throw error;
}

export async function saveSupplierDueDate(id, dueDate) {
  const { error } = await supabase.from('treso_supplier_bills').update({
    due_date: dueDate,
    due_date_source: 'manuel',
  }).eq('id', id);
  if (error) throw error;
  const { error: reviewError } = await supabase
    .from('treso_supplier_pdf_reviews')
    .update({ status: 'dismissed' })
    .eq('bill_id', id)
    .eq('status', 'pending');
  if (reviewError && reviewError.code !== '42P01') throw reviewError;
}

export async function openSupplierPdf(path) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60);
  if (error) throw error;
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
}
