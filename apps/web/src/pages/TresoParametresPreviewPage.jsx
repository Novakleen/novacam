import { useEffect } from 'react';
import i18n from '@/i18n';
import TresoParametresPage from '@/pages/TresoParametresPage';
import { PREVIEW_SETTINGS } from '@/lib/treso/previewFixture';

/** Dev-only settings screen with synthetic coefficients. */
const TresoParametresPreviewPage = () => {
  useEffect(() => {
    i18n.changeLanguage('fr');
  }, []);

  return <TresoParametresPage preview={{ settings: PREVIEW_SETTINGS }} />;
};

export default TresoParametresPreviewPage;
