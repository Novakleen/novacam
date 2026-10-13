import { useEffect } from 'react';
import i18n from '@/i18n';
import TresoDashboardPage from '@/pages/TresoDashboardPage';
import { PREVIEW_LAST_IMPORT, PREVIEW_WHAT_IF, previewForecastInput } from '@/lib/treso/previewFixture';

const INPUT = previewForecastInput();

/** Dev-only what-if (5 000 € on 20/10). Nothing is written. */
const TresoWhatIfPreviewPage = () => {
  useEffect(() => {
    i18n.changeLanguage('fr');
  }, []);

  return (
    <TresoDashboardPage
      preview={{ input: INPUT, lastImport: PREVIEW_LAST_IMPORT }}
      initialWhatIf={PREVIEW_WHAT_IF}
    />
  );
};

export default TresoWhatIfPreviewPage;
