import React from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatMoney } from '@/lib/margin/format';
import { parseMix, serviceLabel } from '@/lib/margin/constants';
import MaPercentBadge from './MaPercentBadge';
import CompletenessFlags from './CompletenessFlags';

const DossierList = ({ dossiers = [], calcs = {}, loading, onNew, onOpen }) => {
  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-2xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (!dossiers.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/50 py-20 text-center space-y-4">
        <p className="text-muted-foreground">Aucun dossier de marge pour l’instant.</p>
        <Button onClick={onNew}>
          <Plus className="h-4 w-4 mr-1" /> Nouveau dossier
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[860px]">
          <thead>
            <tr className="bg-[#2f5f8f] text-white">
              <th className="text-left font-semibold px-4 py-3">Client</th>
              <th className="text-left font-semibold px-3 py-3">Mix</th>
              <th className="text-left font-semibold px-3 py-3">Closer</th>
              <th className="text-right font-semibold px-3 py-3">CA HT</th>
              <th className="text-right font-semibold px-3 py-3">MB</th>
              <th className="text-right font-semibold px-3 py-3">MA</th>
              <th className="text-right font-semibold px-3 py-3">MA %</th>
              <th className="text-left font-semibold px-3 py-3">Complétude</th>
            </tr>
          </thead>
          <tbody>
            {dossiers.map((d, idx) => {
              const calc = calcs[d.id] || {};
              const mix = parseMix(d.mix)
                .map(serviceLabel)
                .join(' + ');
              return (
                <tr
                  key={d.id}
                  onClick={() => onOpen(d)}
                  className={`cursor-pointer border-b last:border-0 hover:bg-muted/50 ${
                    idx % 2 ? 'bg-muted/20' : ''
                  }`}
                >
                  <td className="px-4 py-3 font-medium">{d.client_name || '—'}</td>
                  <td className="px-3 py-3 text-muted-foreground">{mix || '—'}</td>
                  <td className="px-3 py-3">{d.closer || '—'}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatMoney(calc.caHt)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatMoney(calc.mb)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatMoney(calc.ma)}</td>
                  <td className="px-3 py-3 text-right">
                    <MaPercentBadge maPct={calc.maPct} />
                  </td>
                  <td className="px-3 py-3">
                    <CompletenessFlags flags={calc.flags} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DossierList;
