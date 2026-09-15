import React from 'react';
import { MoreHorizontal, Pencil, Trash2, Laptop } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  enrichEntry,
  formatDateDisplay,
  formatHoursDecimal,
  formatTimeDisplay,
  getDayLabel,
} from '@/lib/timeTracking';
import { cn } from '@/lib/utils';

const TimeEntriesTable = ({
  entries = [],
  loading = false,
  onEdit,
  onDelete,
  showUser = true,
  showProject = true,
  emptyMessage = 'Aucune entrée de temps.',
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

  const rows = entries.map(enrichEntry);

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="bg-[#2f5f8f] text-white">
              {showUser && <th className="text-left font-semibold px-4 py-3">Utilisateur</th>}
              <th className="text-left font-semibold px-3 py-3">Date</th>
              <th className="text-left font-semibold px-3 py-3">Jour</th>
              <th className="text-left font-semibold px-3 py-3">Début</th>
              <th className="text-left font-semibold px-3 py-3">Fin</th>
              <th className="text-right font-semibold px-3 py-3">Pause (min)</th>
              <th className="text-right font-semibold px-3 py-3">Heures</th>
              <th className="text-right font-semibold px-3 py-3">Suppl.</th>
              {showProject && <th className="text-left font-semibold px-3 py-3">Projet / tâche</th>}
              <th className="text-left font-semibold px-3 py-3">Client</th>
              <th className="text-right font-semibold px-3 py-3 w-12" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const userName = row.profiles?.full_name || row.profiles?.email || '—';
              const initials =
                row.profiles?.initials ||
                (userName !== '—'
                  ? userName
                      .split(' ')
                      .map((p) => p[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase()
                  : '?');
              const projectLabel =
                row.task_label ||
                row.projects?.name ||
                (row.project_id ? 'Projet' : '—');

              return (
                <tr
                  key={row.id}
                  className={cn(
                    'border-b border-border/60 transition-colors hover:bg-blue-50/40 dark:hover:bg-blue-950/20',
                    idx % 2 === 1 ? 'bg-slate-50/80 dark:bg-slate-900/40' : 'bg-white dark:bg-card'
                  )}
                >
                  {showUser && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5 min-w-[140px]">
                        <div className="h-8 w-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-200 shrink-0">
                          {initials}
                        </div>
                        <span className="font-medium text-foreground truncate">{userName}</span>
                      </div>
                    </td>
                  )}
                  <td className="px-3 py-3 whitespace-nowrap text-foreground">
                    {formatDateDisplay(row.work_date)}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">{getDayLabel(row.work_date)}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{formatTimeDisplay(row.start_time)}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{formatTimeDisplay(row.end_time)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{row.break_minutes ?? 0}</td>
                  <td className="px-3 py-3 text-right tabular-nums font-medium">
                    {formatHoursDecimal(row._hoursWorked)}
                  </td>
                  <td
                    className={cn(
                      'px-3 py-3 text-right tabular-nums font-medium',
                      row._overtime > 0 ? 'text-red-500' : 'text-muted-foreground'
                    )}
                  >
                    {formatHoursDecimal(row._overtime)}
                  </td>
                  {showProject && (
                    <td className="px-3 py-3 max-w-[180px]">
                      <div className="truncate font-medium" title={projectLabel}>
                        {projectLabel}
                      </div>
                      {row.task_label && row.projects?.name && (
                        <div className="text-xs text-muted-foreground truncate">{row.projects.name}</div>
                      )}
                    </td>
                  )}
                  <td className="px-3 py-3 max-w-[180px]">
                    <div className="truncate" title={row.client_name || row.companycam_project_name || ''}>
                      {row.client_name || row.companycam_project_name || '—'}
                    </div>
                    {row.companycam_project_id && (
                      <div className="text-[10px] uppercase tracking-wide text-blue-600 dark:text-blue-400 font-semibold">
                        CompanyCam
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Laptop className="h-3.5 w-3.5 text-muted-foreground/60 hidden sm:block" />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="rounded-xl">
                          <DropdownMenuItem onClick={() => onEdit?.(row)} className="gap-2 cursor-pointer">
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
                    </div>
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

export default TimeEntriesTable;
