import { useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { canAccessTreasury } from '@/lib/roles';

const ROLES = ['Admin', 'Manager', 'Member', 'Viewer'];

/** Dev-only view of the same gate used by /tresorerie. */
const TresoAccessPreviewPage = () => {
  const { t } = useTranslation();

  useEffect(() => {
    i18n.changeLanguage('fr');
  }, []);

  return (
    <DashboardLayout>
      <Helmet>
        <title>{t('treso.accessTitle')} - Novakleen</title>
      </Helmet>
      <div className="max-w-lg space-y-4" data-testid="treso-access">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('treso.accessTitle')}</h1>
        <p className="text-sm text-gray-600 break-words">{t('treso.accessHint')}</p>
        <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-100 bg-white dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-900">
          {ROLES.map((role) => {
            const allowed = canAccessTreasury(role);
            return (
              <li key={role} className="flex items-center justify-between gap-3 px-4 py-3" data-role={role} data-allowed={allowed ? 'yes' : 'no'}>
                <span className="font-medium">{role}</span>
                <span className={allowed ? 'text-sm font-medium text-emerald-700' : 'text-sm font-medium text-red-700'}>
                  {allowed ? t('treso.accessAllowed') : t('treso.accessDenied')}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </DashboardLayout>
  );
};

export default TresoAccessPreviewPage;
