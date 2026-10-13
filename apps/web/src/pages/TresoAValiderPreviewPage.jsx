import React, { useEffect } from 'react';
import i18n from '@/i18n';
import TresoAValiderPage from '@/pages/TresoAValiderPage';

i18n.changeLanguage('fr');

const PREVIEW = {
  supplierReviews: [
    {
      id: 'rev-amount',
      bill_id: 'bill-nord',
      file_name: 'facture-exemple-nord.pdf',
      supplier_name: 'Fournitures Nord',
      invoice_number: 'FN-2026-12',
      amount_ttc: 450,
      proposed_due_date: '2026-10-31',
      proposed_source: 'pdf',
      payment_terms: '30 jours fin de mois',
      confidence: 0.91,
      reason: 'amount_mismatch',
      treso_supplier_bills: {
        id: 'bill-nord',
        supplier_name: 'Fournitures Nord',
        amount_ttc: 430,
        due_date: '2026-11-01',
        invoice_number: 'FN-2026-12',
      },
    },
    {
      id: 'rev-scan',
      bill_id: null,
      file_name: 'facture-exemple-scan.pdf',
      supplier_name: 'Atelier Exemple',
      invoice_number: 'AE-44',
      amount_ttc: 250,
      proposed_due_date: '2026-11-12',
      proposed_source: 'pdf',
      confidence: 0.42,
      reason: 'low_confidence',
    },
  ],
  openBills: [
    { id: 'bill-paper', supplier_name: 'Papeterie du Parc', amount_ttc: 215, invoice_number: 'PP-3' },
    { id: 'bill-bois', supplier_name: 'Bois & Cie', amount_ttc: 760, invoice_number: 'BC-8' },
  ],
  rows: [
    {
      id: 'demo-1',
      booking_date: '2026-10-12',
      amount: 1250,
      counterparty_name: 'Atelier Nord',
      communication: 'Virement',
      match_status: 'a_valider',
      treso_client_invoices: {
        id: 'inv-9001',
        invoice_number: '2BLX-9001',
        client_name: 'Atelier Nord',
        amount_ttc: 1250,
        hubspot_invoice_id: '9001',
        bank_paid_amount: 0,
        paid_at: null,
      },
    },
    {
      id: 'demo-2',
      booking_date: '2026-10-08',
      amount: 640,
      counterparty_name: 'Menuiserie Démo',
      communication: 'Paiement',
      match_status: 'a_valider',
      treso_client_invoices: {
        id: 'inv-9002',
        invoice_number: '2BLX-9002',
        client_name: 'Menuiserie Démo',
        amount_ttc: 640,
        hubspot_invoice_id: '9002',
        bank_paid_amount: 0,
        paid_at: null,
      },
    },
    {
      id: 'demo-3',
      booking_date: '2026-10-03',
      amount: 88.5,
      counterparty_name: 'Studio Exemple',
      communication: 'Solde',
      match_status: 'a_valider',
      treso_client_invoices: {
        id: 'inv-9003',
        invoice_number: '2BLX-9003',
        client_name: 'Studio Exemple',
        amount_ttc: 88.5,
        hubspot_invoice_id: '9003',
        bank_paid_amount: 0,
        paid_at: null,
      },
    },
  ],
};

/** Dev-only screen with synthetic figures. Not linked from the menu. */
const TresoAValiderPreviewPage = () => {
  useEffect(() => {
    i18n.changeLanguage('fr');
  }, []);

  return <TresoAValiderPage preview={PREVIEW} />;
};

export default TresoAValiderPreviewPage;
