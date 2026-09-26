import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { MOVE_TYPES, productName } from '@/lib/fleet/api';
import { NAVY, ProductDot } from './FleetUI';
import MovesTimeline, { MOVE_ICON } from './MovesTimeline';

const PERIODS = [
  ['7', 7],
  ['30', 30],
  ['90', 90],
  ['all', null],
];

const Chip = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 h-9 text-sm font-medium',
      active ? 'border-transparent text-white' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900'
    )}
    style={active ? { backgroundColor: NAVY } : undefined}
  >
    {children}
  </button>
);

const Row = ({ label, children }) => (
  <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
    <span className="shrink-0 w-16 text-xs font-bold uppercase tracking-wider text-gray-400">{label}</span>
    {children}
  </div>
);

const MovesPanel = ({ moves, data, index, loading }) => {
  const { t } = useTranslation();
  const lang = index.lang;
  const [type, setType] = useState('all');
  const [loc, setLoc] = useState('all');
  const [slug, setSlug] = useState('all');
  const [period, setPeriod] = useState('30');

  const locations = useMemo(() => {
    const list = [];
    if (index.depot) list.push({ id: index.depot.id, label: t('fleet.depot') });
    for (const v of data.vans) {
      const l = index.locationByVan.get(v.id);
      if (l) list.push({ id: l.id, label: v.name });
    }
    return list;
  }, [data.vans, index, t]);

  const filtered = useMemo(() => {
    const days = PERIODS.find(([k]) => k === period)?.[1];
    const since = days ? Date.now() - days * 86400000 : null;
    return moves.filter(
      (m) =>
        (type === 'all' || m.type === type) &&
        (loc === 'all' || m.from_location_id === loc || m.to_location_id === loc) &&
        (slug === 'all' || m.product_slug === slug) &&
        (!since || new Date(m.created_at).getTime() >= since)
    );
  }, [moves, type, loc, slug, period]);

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="space-y-2 rounded-3xl bg-gray-50 dark:bg-gray-900/60 border border-gray-100 dark:border-gray-800 p-3">
        <Row label={t('fleet.moves.type')}>
          <Chip active={type === 'all'} onClick={() => setType('all')}>{t('fleet.filter.all')}</Chip>
          {MOVE_TYPES.map((ty) => {
            const Icon = MOVE_ICON[ty].icon;
            return (
              <Chip key={ty} active={type === ty} onClick={() => setType(ty)}>
                <Icon className="h-3.5 w-3.5" />
                {t(`fleet.moveTypes.${ty}`)}
              </Chip>
            );
          })}
        </Row>
        <Row label={t('fleet.moves.place')}>
          <Chip active={loc === 'all'} onClick={() => setLoc('all')}>{t('fleet.filter.all')}</Chip>
          {locations.map((l) => (
            <Chip key={l.id} active={loc === l.id} onClick={() => setLoc(l.id)}>{l.label}</Chip>
          ))}
        </Row>
        <Row label={t('fleet.product')}>
          <Chip active={slug === 'all'} onClick={() => setSlug('all')}>{t('fleet.filter.all')}</Chip>
          {data.products.map((p) => (
            <Chip key={p.slug} active={slug === p.slug} onClick={() => setSlug(p.slug)}>
              <ProductDot color={p.color} className="h-2.5 w-2.5" />
              {productName(p, lang)}
            </Chip>
          ))}
        </Row>
        <Row label={t('fleet.moves.period')}>
          {PERIODS.map(([k]) => (
            <Chip key={k} active={period === k} onClick={() => setPeriod(k)}>
              {k === 'all' ? t('fleet.filter.all') : t('fleet.moves.days', { count: Number(k) })}
            </Chip>
          ))}
        </Row>
      </div>
      <p className="text-xs text-gray-500">{t('fleet.moves.readOnlyHint')}</p>
      {loading ? (
        <p className="text-sm text-gray-500">{t('common.loading')}</p>
      ) : (
        <MovesTimeline moves={filtered} index={index} />
      )}
    </div>
  );
};

export default MovesPanel;
