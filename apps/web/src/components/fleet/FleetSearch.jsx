import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { nodeName } from '@/lib/fleet/inventory';
import { CondPill } from './FleetUI';
import NodeIcon from './NodeIcon';

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** « Où est la pompe ? » — searches every visible node (name FR/NL/EN, serial, brand) and shows the full path. */
const FleetSearch = ({ nodes, tree, lang, onPick }) => {
  const { t } = useTranslation();
  const [q, setQ] = useState('');

  const results = useMemo(() => {
    const needle = norm(q.trim());
    if (needle.length < 2) return [];
    return nodes
      .filter((n) => !['depot', 'van', 'zone'].includes(n.kind))
      .filter((n) => [n.name, n.name_nl, n.name_en, n.serial, n.brand, n.model].some((v) => norm(v).includes(needle)))
      .slice(0, 12);
  }, [q, nodes]);

  return (
    <div className="relative">
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t('fleet.search.placeholder')}
        className="h-12 rounded-full pl-11 pr-10 text-base"
      />
      {q && (
        <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400" onClick={() => setQ('')} aria-label="clear">
          <X className="h-4 w-4" />
        </button>
      )}
      {q.trim().length >= 2 && (
        <div className="absolute z-30 mt-2 w-full rounded-3xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-xl p-2 max-h-[60vh] overflow-y-auto">
          {results.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">{t('fleet.search.none')}</p>
          ) : (
            results.map((n) => {
              const worst = tree.worst(n.id);
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    setQ('');
                    onPick(n);
                  }}
                  className="w-full flex items-center gap-3 rounded-2xl p-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <NodeIcon node={n} className="h-10 w-10" />
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold truncate">
                      {nodeName(n, lang)}
                      {n.kind === 'materiel' && n.qty > 1 && <span className="text-gray-500 font-normal"> × {n.qty}</span>}
                    </span>
                    <span className="block text-xs text-gray-500 truncate">
                      {tree
                        .path(n.id)
                        .slice(0, -1)
                        .map((p) => nodeName(p, lang))
                        .join(' › ')}
                    </span>
                  </span>
                  {worst !== 'ok' && <CondPill condition={worst} label={t(`fleet.cond.${worst}`)} />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default FleetSearch;
