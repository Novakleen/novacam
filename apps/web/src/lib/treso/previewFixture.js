/**
 * Synthetic treasury snapshot for screenshots and tests.
 * Fictional names and round figures — not a customer export.
 */
export const PREVIEW_AS_OF = '2026-10-12';

export const PREVIEW_SETTINGS = {
  collection_delay_days: 8,
  alert_threshold: 0,
  usual_revenue_ht_month: 18000,
  ttc_ratio: 1.06,
  probable_enabled: true,
  probable_start_date: '2026-10-09',
  danny_rate: 0.075,
  danny_day: 13,
  withholding_rate: 0.28,
  withholding_due_day: 6,
  stale_after_business_days: 2,
  supplier_default_due_days: 30,
  horizon_weeks: 13,
  seasonality_coefficients: [0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.2, 1.1, 1, 0.85, 0.75],
};

function commitment(row) {
  return {
    direction: 'out',
    is_active: true,
    excluded_from_cash: false,
    spread_weekly: false,
    amount_rule: 'fixed',
    frequency: 'monthly',
    end_date: null,
    remaining_occurrences: null,
    needs_review: false,
    category: 'autre',
    kind: 'fixe',
    ...row,
  };
}

export function previewForecastInput() {
  return {
    asOf: PREVIEW_AS_OF,
    settings: PREVIEW_SETTINGS,
    accounts: [
      { id: 'demo-courant', name: 'Compte courant', kind: 'courant', include_in_cash: true, is_active: true },
    ],
    snapshots: [
      { account_id: 'demo-courant', balance_date: '2026-10-09', balance: 4200, source: 'manuel' },
    ],
    transactions: [],
    commitments: [
      commitment({ id: 'loyer', label: 'Loyer atelier', counterparty: 'Loyer atelier', amount: 900, day_of_month: 15, next_due_date: '2026-10-15', category: 'loyer' }),
      commitment({ id: 'salaire', label: 'Salaire démo', counterparty: 'Salaire démo', amount: 1600, day_of_month: 20, next_due_date: '2026-10-20', category: 'salaires' }),
      commitment({ id: 'leasing', label: 'Leasing véhicule', counterparty: 'Leasing véhicule', amount: 480, day_of_month: 24, next_due_date: '2026-10-24', category: 'leasing' }),
      commitment({ id: 'assurance', label: 'Assurance atelier', counterparty: 'Assurance atelier', amount: 210, day_of_month: 22, next_due_date: '2026-10-22', category: 'assurance', needs_review: true }),
      commitment({ id: 'honoraires', label: 'Honoraires comptable', counterparty: 'Honoraires comptable', amount: 350, day_of_month: 27, next_due_date: '2026-10-27', category: 'honoraires' }),
      commitment({ id: 'telecom', label: 'Télécom', counterparty: 'Télécom', amount: 89, day_of_month: 30, next_due_date: '2026-10-30', category: 'abonnement' }),
      commitment({ id: 'entretien', label: 'Entretien local', counterparty: 'Entretien local', amount: 140, day_of_month: 2, next_due_date: '2026-11-02', category: 'autre' }),
      commitment({ id: 'logiciel', label: 'Suite logicielle', counterparty: 'Suite logicielle', amount: 75, day_of_month: 5, next_due_date: '2026-11-05', category: 'abonnement' }),
      commitment({ id: 'energie', label: 'Énergie', counterparty: 'Énergie', amount: 260, day_of_month: 8, next_due_date: '2026-11-08', category: 'autre' }),
      commitment({ id: 'materiel', label: 'Matériel chantier', counterparty: 'Matériel chantier', amount: 3200, day_of_month: 28, next_due_date: '2026-10-28', category: 'matieres' }),
      commitment({ id: 'carburant', label: 'Carburant', counterparty: 'Carburant démo', amount: 640, day_of_month: 16, next_due_date: '2026-10-16', spread_weekly: true, category: 'carburant', kind: 'variable' }),
      commitment({ id: 'pub', label: 'Publicité', counterparty: 'Régie pub', amount: 520, day_of_month: 17, next_due_date: '2026-10-17', spread_weekly: true, category: 'publicite', kind: 'variable' }),
      commitment({ id: 'outils', label: 'Outils en ligne', counterparty: 'Outils en ligne', amount: 180, day_of_month: 11, next_due_date: null, spread_weekly: true, category: 'abonnement', kind: 'variable' }),
      commitment({ id: 'inactif', label: 'Prime suspendue', counterparty: 'Prime suspendue', amount: 800, day_of_month: 1, next_due_date: '2026-10-01', is_active: false, category: 'salaires' }),
    ],
    invoices: [
      { id: 'inv-1', invoice_number: 'DEMO-1001', client_name: 'Maison Bleue', invoice_date: '2026-09-01', amount_ttc: 1860, bank_paid_amount: 0, accountable_status: 'Envoyé' },
      { id: 'inv-2', invoice_number: 'DEMO-1002', client_name: 'Studio Lumen', invoice_date: '2026-09-18', amount_ttc: 940, bank_paid_amount: 0, accountable_status: 'Envoyé' },
      { id: 'inv-3', invoice_number: 'DEMO-1003', client_name: 'Atelier Nord', invoice_date: '2026-10-08', amount_ttc: 1280, bank_paid_amount: 0, accountable_status: 'Envoyé' },
      { id: 'inv-x', invoice_number: 'DEMO-9000', client_name: 'Dossier neutre', invoice_date: '2026-07-09', amount_ttc: 5000, excluded_from_cash: true },
    ],
    supplierBills: [
      { id: 'bill-1', supplier_name: 'Fournitures Nord', invoice_date: '2026-10-02', due_date: '2026-10-06', amount_ttc: 430, is_paid: false },
      { id: 'bill-2', supplier_name: 'Papeterie du Parc', invoice_date: '2026-10-01', due_date: '2026-10-28', amount_ttc: 215, is_paid: false },
      { id: 'bill-3', supplier_name: 'Bois & Cie', invoice_date: '2026-09-28', due_date: '2026-10-31', amount_ttc: 760, is_paid: false },
      { id: 'bill-x', supplier_name: 'Dossier neutre', invoice_date: '2026-10-01', due_date: '2026-10-12', amount_ttc: 900, excluded_from_cash: true, is_paid: false },
    ],
    jobs: [
      {
        id: 'job-1',
        hubspot_deal_id: 'deal-demo',
        label: 'Chantier Verger',
        end_date: '2026-10-20',
        amount_ttc: 1500,
        link_status: 'auto',
        invoiced: false,
      },
      {
        id: 'job-undated',
        hubspot_deal_id: 'deal-undated',
        label: 'Chantier sans date',
        client_name: 'Maison Verte',
        end_date: null,
        amount_ttc: 800,
        invoiced: false,
      },
    ],
    cashEvents: [
      { id: 'evt-1', event_date: '2026-11-06', label: 'Acompte matériel', amount: 350, direction: 'out', category: 'autre', excluded_from_cash: false },
    ],
  };
}

export const PREVIEW_LAST_IMPORT = {
  batch: {
    created_at: '2026-10-12T06:10:00Z',
    channel: 'ecran',
    rows_inserted: 12,
    data_as_of: '2026-10-09',
  },
  balance: { balance: 4200, balance_date: '2026-10-09' },
  today: PREVIEW_AS_OF,
  staleAfterBusinessDays: 2,
};

export const PREVIEW_WHAT_IF = {
  amount: '5000',
  date: '2026-10-20',
  label: 'Achat démo',
};

function demoTx(row) {
  return {
    account_id: 'demo-courant',
    excluded_from_cash: false,
    is_internal_transfer: false,
    ...row,
  };
}

/**
 * Same fictional books as previewForecastInput, plus dated invoices,
 * an unknown supplier due date, and bank lines so the cash charts render.
 */
export function previewCashflowInput() {
  const input = previewForecastInput();
  input.invoices = [
    { id: 'inv-1', invoice_number: 'DEMO-1001', client_name: 'Maison Bleue', invoice_date: '2026-08-01', due_date: '2026-08-10', amount_ttc: 1860, bank_paid_amount: 360, accountable_status: 'Envoyé' },
    { id: 'inv-2', invoice_number: 'DEMO-1002', client_name: 'Studio Lumen', invoice_date: '2026-09-01', due_date: '2026-09-15', amount_ttc: 940, bank_paid_amount: 0, accountable_status: 'Envoyé' },
    { id: 'inv-3', invoice_number: 'DEMO-1003', client_name: 'Atelier Nord', invoice_date: '2026-09-05', due_date: '2026-09-01', amount_ttc: 1280, bank_paid_amount: 0, accountable_status: 'Envoyé' },
    { id: 'inv-4', invoice_number: 'DEMO-1004', client_name: 'Galerie Est', invoice_date: '2026-10-01', due_date: '2026-10-28', amount_ttc: 640, bank_paid_amount: 0, accountable_status: 'Envoyé' },
    { id: 'inv-paid', invoice_number: 'DEMO-1005', client_name: 'Clos Payé', invoice_date: '2026-09-01', due_date: '2026-09-15', amount_ttc: 500, bank_paid_amount: 0, accountable_status: 'Payé' },
    { id: 'inv-x', invoice_number: 'DEMO-9000', client_name: 'Dossier neutre', invoice_date: '2026-07-09', due_date: '2026-07-20', amount_ttc: 5000, excluded_from_cash: true, accountable_status: 'Envoyé' },
  ];
  input.supplierBills = [
    ...input.supplierBills,
    { id: 'bill-unknown', supplier_name: 'Atelier Inconnu', invoice_date: '2026-10-03', due_date: null, amount_ttc: 180, is_paid: false },
  ];
  input.commitments = [
    ...input.commitments.map((row) => (row.id === 'inactif' ? { ...row, frequency: 'quarterly' } : row)),
    {
      direction: 'out',
      is_active: true,
      excluded_from_cash: false,
      spread_weekly: false,
      amount_rule: 'fixed',
      frequency: 'yearly',
      end_date: null,
      remaining_occurrences: null,
      needs_review: false,
      kind: 'fixe',
      id: 'taxe',
      label: 'Précompte',
      counterparty: 'SPF Finances',
      amount: 1200,
      day_of_month: 20,
      next_due_date: '2026-12-20',
      category: 'tva_impots',
    },
  ];
  input.transactions = [
    demoTx({ id: 'tx-in-may', booking_date: '2026-05-04', amount: 2000, counterparty_name: 'Maison Bleue' }),
    demoTx({ id: 'tx-rent-may', booking_date: '2026-05-20', amount: -900, counterparty_name: 'Loyer atelier' }),
    demoTx({ id: 'tx-ins', booking_date: '2026-06-02', amount: -210, counterparty_name: 'Assurance atelier' }),
    demoTx({ id: 'tx-in-jul', booking_date: '2026-07-10', amount: 1500, counterparty_name: 'Studio Lumen' }),
    demoTx({ id: 'tx-aug', booking_date: '2026-08-03', amount: -480, counterparty_name: 'Quincaillerie Démo' }),
    demoTx({ id: 'tx-rent-sep', booking_date: '2026-09-15', amount: -900, counterparty_name: 'Loyer atelier' }),
    demoTx({ id: 'tx-in-sep', booking_date: '2026-09-28', amount: 800, counterparty_name: 'Client Démo' }),
    demoTx({ id: 'tx-internal', booking_date: '2026-10-01', amount: -100, counterparty_name: 'Virement interne', is_internal_transfer: true }),
    demoTx({ id: 'tx-excluded', booking_date: '2026-10-02', amount: 50, counterparty_name: 'Hors caisse', excluded_from_cash: true }),
  ];
  return input;
}
