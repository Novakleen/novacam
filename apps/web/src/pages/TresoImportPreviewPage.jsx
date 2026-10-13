import React, { useEffect } from 'react';
import i18n from '@/i18n';
import TresoImportPage from '@/pages/TresoImportPage';

const PREVIEW = {
  fileName: 'exemple-synthetique.xlsx',
  balanceBelfius: '1000.00',
  balanceDate: '2026-10-09',
  balanceVisa: '0.00',
  visaDate: '2026-10-09',
  revealedKey: 'nvk_demo_0123456789abcdef0123456789abcd',
  report: {
    already_imported: false,
    rows_total: 12,
    rows_inserted: 10,
    rows_duplicate: 2,
    exact_duplicates: 2,
    rows_skipped: 0,
    date_min: '2026-10-01',
    date_max: '2026-10-09',
    internal_transfers: 1,
    supplier_bills_inserted: 3,
    supplier_bills_marked_paid: 1,
    factures_present: true,
    factures_matched: 8,
    factures_unmatched: 2,
  },
  keys: [
    {
      id: 'demo-active',
      key_prefix: 'nvk_demo_012',
      revoked_at: null,
      last_used_at: null,
    },
    {
      id: 'demo-revoked',
      key_prefix: 'nvk_old_9ab',
      revoked_at: '2026-10-01T08:00:00Z',
      last_used_at: '2026-09-30T08:00:00Z',
    },
  ],
  pdfNames: ['facture-exemple-nord.pdf', 'facture-exemple-atelier.pdf'],
  pdfReport: { applied: 1, queued: 1, kept: 0, errors: 0 },
  lastImport: {
    today: '2026-10-13',
    staleAfterBusinessDays: 2,
    batch: {
      created_at: '2026-10-08T07:10:00Z',
      channel: 'api',
      rows_inserted: 42,
      data_as_of: '2026-10-08',
    },
    balance: {
      balance: 2651.62,
      balance_date: '2026-10-08',
    },
  },
};

/** Dev-only screen with synthetic figures. Not linked from the menu. */
const TresoImportPreviewPage = () => {
  useEffect(() => {
    i18n.changeLanguage('fr');
  }, []);

  return <TresoImportPage preview={PREVIEW} />;
};

export default TresoImportPreviewPage;
