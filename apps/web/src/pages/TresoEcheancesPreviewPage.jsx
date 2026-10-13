import { useEffect } from 'react';
import i18n from '@/i18n';
import TresoEcheancesPage from '@/pages/TresoEcheancesPage';
import { previewForecastInput } from '@/lib/treso/previewFixture';

const INPUT = previewForecastInput();

/** Dev-only commitments editor with synthetic rows. */
const TresoEcheancesPreviewPage = () => {
  useEffect(() => {
    i18n.changeLanguage('fr');
  }, []);

  return (
    <TresoEcheancesPage
      preview={{
        commitments: INPUT.commitments,
        events: INPUT.cashEvents,
        supplierBills: (INPUT.supplierBills || []).filter((bill) => !bill.excluded_from_cash).map((bill, index) => ({
          ...bill,
          due_date_source: index === 0 ? 'pdf' : 'estimee',
          pdf_path: index === 0 ? 'demo/facture-exemple.pdf' : null,
        })),
      }}
    />
  );
};

export default TresoEcheancesPreviewPage;
