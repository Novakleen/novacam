import React, { useEffect } from 'react';
import i18n from '@/i18n';
import TresoAValiderPage from '@/pages/TresoAValiderPage';

i18n.changeLanguage('fr');

const PREVIEW = {
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
