import { useEffect } from 'react';
import i18n from '@/i18n';
import TresoDashboardPage from '@/pages/TresoDashboardPage';
import { PREVIEW_LAST_IMPORT, previewForecastInput } from '@/lib/treso/previewFixture';

const INPUT = previewForecastInput();

/** Dev-only screen with synthetic figures. Not linked from the menu. */
const TresoDashboardPreviewPage = () => {
  useEffect(() => {
    i18n.changeLanguage('fr');
  }, []);

  return <TresoDashboardPage preview={{ input: INPUT, lastImport: PREVIEW_LAST_IMPORT }} />;
};

export default TresoDashboardPreviewPage;
