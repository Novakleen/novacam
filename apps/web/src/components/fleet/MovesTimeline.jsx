import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ArrowLeftRight, HelpCircle, ShoppingCart, SlidersHorizontal, SprayCan } from 'lucide-react';
import { cn } from '@/lib/utils';
import { firstName, fmtL, productName } from '@/lib/fleet/api';
import { ProductDot } from './FleetUI';

export const MOVE_ICON = {
  purchase: { icon: ShoppingCart, cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  transfer: { icon: ArrowLeftRight, cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  spray_consume: { icon: SprayCan, cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' },
  adjust: { icon: SlidersHorizontal, cls: 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
};

function localeOf(lang) {
  return lang === 'nl' ? 'nl-BE' : lang === 'en' ? 'en-GB' : 'fr-BE';
}

const MovesTimeline = ({ moves, index, compact = false }) => {
  const { t } = useTranslation();
  const lang = index.lang;

  if (!moves.length) {
    return <p className="text-sm text-gray-500">{t('fleet.moves.empty')}</p>;
  }

  const locName = (id) => {
    if (!id) return null;
    const loc = index.locationById.get(id);
    if (!loc) return '—';
    return loc.kind === 'depot' ? t('fleet.depot') : index.vanById.get(loc.van_id)?.name || loc.name;
  };

  let lastDay = null;
  return (
    <ol className="space-y-2">
      {moves.map((m) => {
        const day = new Date(m.created_at).toLocaleDateString(localeOf(lang), {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        });
        const showDay = !compact && day !== lastDay;
        lastDay = day;
        const meta = MOVE_ICON[m.type] || MOVE_ICON.adjust;
        const Icon = meta.icon;
        const product = index.productBySlug.get(m.product_slug);
        const litres = Number(m.applied_litres ?? m.qty_litres);
        const sign =
          m.type === 'purchase' || (m.type === 'adjust' && m.to_location_id)
            ? '+'
            : m.type === 'transfer'
              ? ''
              : '−';
        const place =
          m.type === 'transfer'
            ? `${locName(m.from_location_id)} → ${locName(m.to_location_id)}`
            : locName(m.from_location_id || m.to_location_id);
        const who = firstName(index.profileById.get(m.user_id || m.created_by));
        const time = new Date(m.created_at).toLocaleTimeString(localeOf(lang), { hour: '2-digit', minute: '2-digit' });
        const bits = [
          place,
          m.chantier ? t('fleet.moves.chantier', { name: m.chantier }) : null,
          m.type === 'adjust' && m.reason ? t(`fleet.reasons.${m.reason}`) : null,
          m.type === 'purchase' && m.supplier ? m.supplier : null,
          compact ? day : null,
          time,
          who !== '—' ? who : null,
        ].filter(Boolean);

        return (
          <React.Fragment key={m.id}>
            {showDay && (
              <li className="pt-2 text-xs font-bold uppercase tracking-wider text-gray-400">{day}</li>
            )}
            <li className="flex items-start gap-3 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-3">
              <span className={cn('h-10 w-10 rounded-xl flex items-center justify-center shrink-0', meta.cls)}>
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-bold flex items-center gap-2 flex-wrap">
                  <span className={cn('tabular-nums', sign === '−' ? 'text-red-600' : sign === '+' ? 'text-emerald-600' : '')}>
                    {sign}
                    {fmtL(litres)} L
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <ProductDot color={product?.color} className="h-2.5 w-2.5" />
                    {product ? productName(product, lang) : m.product_slug}
                  </span>
                </p>
                <p className="text-xs text-gray-500 mt-0.5 break-words">{bits.join('  ·  ')}</p>
                {m.note && <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 italic">{m.note}</p>}
                {(m.unknown_van || m.insufficient_stock) && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {m.unknown_van && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 px-2 py-0.5 text-[11px] font-bold">
                        <HelpCircle className="h-3 w-3" />
                        {t('fleet.moves.unknownVan')}
                      </span>
                    )}
                    {m.insufficient_stock && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 px-2 py-0.5 text-[11px] font-bold">
                        <AlertTriangle className="h-3 w-3" />
                        {t('fleet.moves.insufficient', {
                          qty: fmtL(m.qty_litres),
                          applied: fmtL(m.applied_litres ?? m.qty_litres),
                        })}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </li>
          </React.Fragment>
        );
      })}
    </ol>
  );
};

export default MovesTimeline;
