import { useEffect } from 'react';
import i18n from '@/i18n';
import TresoDashboardPage from '@/pages/TresoDashboardPage';
import { PREVIEW_LAST_IMPORT, previewCashflowInput } from '@/lib/treso/previewFixture';

const INPUT = previewCashflowInput();

/** Dev-only cash dashboard. The what-if simulator is no longer on this screen. */
const TresoWhatIfPreviewPage = () => {
  useEffect(() => {
    i18n.changeLanguage('fr');
  }, []);

  return <TresoDashboardPage preview={{ input: INPUT, lastImport: PREVIEW_LAST_IMPORT }} />;
};

export default TresoWhatIfPreviewPage;
