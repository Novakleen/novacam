/**
 * HubSpot invoice amounts for margin CA (must be excl. VAT / HTVA).
 *
 * Official properties (portal schema):
 * - hs_amount_billed_pre_tax — Amount billed (pre-tax) → HT
 * - hs_amount_billed — Amount billed → typically TTC (incl. tax)
 * - hs_taxes_total — Taxes total
 *
 * Never treat hs_amount_billed alone as CA HT.
 */

/** Properties needed to resolve invoice HTVA via HubSpot CRM. */
export const HUBSPOT_INVOICE_AMOUNT_PROPERTIES = [
  'hs_number',
  'hs_invoice_number',
  'hs_amount_billed',
  'hs_amount_billed_pre_tax',
  'hs_taxes_total',
  'hs_currency',
  'hs_invoice_status',
  'hs_title',
  'hs_balance_due',
];

function toFiniteNumber(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function roundMoney(n) {
  if (n == null || !Number.isFinite(Number(n))) return n;
  return Math.round(Number(n) * 100) / 100;
}

/**
 * Resolve invoice amount excluding VAT (HTVA).
 * @param {Record<string, unknown>|null|undefined} props HubSpot invoice properties
 * @returns {{ amountHt: number|null, amountTtc: number|null, taxesTotal: number|null, source: 'pre_tax'|'billed_minus_tax'|null }}
 */
export function resolveInvoiceAmountHt(props) {
  const p = props && typeof props === 'object' ? props : {};
  const preTax = toFiniteNumber(p.hs_amount_billed_pre_tax);
  const billed = toFiniteNumber(
    p.hs_amount_billed ?? p.hs_invoice_total_amount ?? p.hs_balance_due ?? p.amount
  );
  const taxes = toFiniteNumber(p.hs_taxes_total);

  if (preTax != null) {
    return {
      amountHt: roundMoney(preTax),
      amountTtc: billed,
      taxesTotal: taxes,
      source: 'pre_tax',
    };
  }

  // Derive HT when TTC and tax total are known (incl. 0% tax → HT = TTC)
  if (billed != null && taxes != null && taxes >= 0 && billed >= taxes) {
    return {
      amountHt: roundMoney(billed - taxes),
      amountTtc: billed,
      taxesTotal: taxes,
      source: 'billed_minus_tax',
    };
  }

  // Do not fall back to TTC as HT — that inflated margins (CA TVAC used as CA HT).
  return {
    amountHt: null,
    amountTtc: billed,
    taxesTotal: taxes,
    source: null,
  };
}

export default resolveInvoiceAmountHt;
