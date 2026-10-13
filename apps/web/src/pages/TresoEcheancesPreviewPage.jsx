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

  return <TresoEcheancesPage preview={{ commitments: INPUT.commitments, events: INPUT.cashEvents }} />;
};

export default TresoEcheancesPreviewPage;
