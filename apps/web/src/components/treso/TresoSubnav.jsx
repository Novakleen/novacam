import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const LINKS = [
  { id: 'import', to: '/tresorerie/import', label: 'navImport' },
  { id: 'queue', to: '/tresorerie/a-valider', label: 'navQueue' },
];

const TresoSubnav = ({ active }) => {
  const { t } = useTranslation();
  return (
    <nav className="flex gap-2" aria-label={t('nav.treasury')}>
      {LINKS.map((link) => {
        const className = ({ isActive }) => {
          const on = active ? active === link.id : isActive;
          return `rounded-full px-3 py-1.5 text-sm font-medium ${
            on
              ? 'bg-primary text-primary-foreground'
              : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700'
          }`;
        };
        return (
          <NavLink key={link.id} to={link.to} className={className}>
            {t(`treso.${link.label}`)}
          </NavLink>
        );
      })}
    </nav>
  );
};

export default TresoSubnav;
