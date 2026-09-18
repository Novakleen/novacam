import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Languages } from 'lucide-react';

const LANGS = [
  { code: 'fr', label: 'FR' },
  { code: 'nl', label: 'NL' },
  { code: 'en', label: 'EN' },
];

const LanguageSwitcher = ({ variant = 'ghost', size = 'sm', className = '' }) => {
  const { i18n, t } = useTranslation();
  const current = (i18n.resolvedLanguage || i18n.language || 'fr').slice(0, 2);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant={variant}
          size={size}
          className={`rounded-xl gap-1.5 ${className}`}
          aria-label={t('common.language')}
        >
          <Languages className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase tracking-wide">{current}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="rounded-xl min-w-[100px]">
        {LANGS.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            className={`rounded-lg cursor-pointer font-medium ${
              current === lang.code ? 'bg-accent' : ''
            }`}
            onClick={() => i18n.changeLanguage(lang.code)}
          >
            {lang.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default LanguageSwitcher;
