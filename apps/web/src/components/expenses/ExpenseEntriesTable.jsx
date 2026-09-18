import React from 'react';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDateDisplay } from '@/lib/timeTracking';
import { formatMoney } from '@/lib/margin/format';
import { cn } from '@/lib/utils';
import { EXPENSE_CATEGORY_LABELS } from '@/components/expenses/ExpenseEntryFormDialog';

const ExpenseEntriesTable = ({
  entries = [],
  loading = false,
  onEdit,
  onDelete,
  emptyMessage = 'Aucune dépense enregistrée.',
}) => {
  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-12 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (!entries.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/50 py-16 text-center text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="bg-[#2f5f8f] text-white">
              <th className="text-left font-semibold px-4 py-3">Date</th>
              <th className="text-left font-semibold px-3 py-3">Catégorie</th>
              <th className="text-left font-semibold px-3 py-3">Libellé</th>
              <th className="text-right font-semibold px-3 py-3">Montant HT</th>
              <th className="text-left font-semibold px-3 py-3">Membre</th>
              <th className="text-right font-semibold px-3 py-3 w-12" />
            </tr>
          </thead>
          <tbody>
            {entries.map((row, idx) => {
              const userName = row.profiles?.full_name || row.profiles?.email || '—';
              const categoryLabel =
                EXPENSE_CATEGORY_LABELS[row.category] || row.category || '—';

              return (
                <tr
                  key={row.id}
                  className={cn(
                    'border-b border-border/60 transition-colors hover:bg-amber-50/40 dark:hover:bg-amber-950/20',
                    idx % 2 === 1
                      ? 'bg-slate-50/80 dark:bg-slate-900/40'
                      : 'bg-white dark:bg-card'
                  )}
                >
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatDateDisplay(row.expense_date)}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap font-medium">{categoryLabel}</td>
                  <td className="px-3 py-3 max-w-[240px]">
                    <div className="truncate" title={row.label || ''}>
                      {row.label || '—'}
                    </div>
                    {row.companycam_project_id && !row.project_id && (
                      <div className="text-[10px] uppercase tracking-wide text-blue-600 dark:text-blue-400 font-semibold">
                        CompanyCam
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums font-medium">
                    {formatMoney(row.amount_ht)}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">{userName}</td>
                  <td className="px-3 py-3 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="rounded-xl">
                        <DropdownMenuItem
                          onClick={() => onEdit?.(row)}
                          className="gap-2 cursor-pointer"
                        >
                          <Pencil className="h-4 w-4" /> Modifier
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onDelete?.(row)}
                          className="gap-2 cursor-pointer text-red-600 focus:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" /> Supprimer
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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

export default ExpenseEntriesTable;
