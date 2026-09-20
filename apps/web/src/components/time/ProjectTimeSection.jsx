import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Clock, RefreshCw, FileSpreadsheet } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import TimeEntriesTable from '@/components/time/TimeEntriesTable';
import TimeEntryFormDialog from '@/components/time/TimeEntryFormDialog';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import {
  formatHoursDecimal,
  sumHours,
  buildQuoteLineItemProgress,
  fetchProjectQuoteSnapshot,
} from '@/lib/timeTracking';

const ProjectTimeSection = ({ projectId, projectName, companycamProjectId, hubspotContactId = null }) => {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [entries, setEntries] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [resolvedHsContactId, setResolvedHsContactId] = useState(hubspotContactId || null);
  const [projectHs, setProjectHs] = useState({
    hubspot_quote_id: null,
    hubspot_quote_title: null,
    hubspot_quote_line_items: [],
  });

  const [resolvedProjectId, setResolvedProjectId] = useState(projectId || null);

  useEffect(() => {
    setResolvedProjectId(projectId || null);
    if (!projectId && !companycamProjectId && !hubspotContactId) {
      setResolvedHsContactId(null);
      setProjectHs({
        hubspot_quote_id: null,
        hubspot_quote_title: null,
        hubspot_quote_line_items: [],
      });
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await fetchProjectQuoteSnapshot(supabase, {
        projectId: projectId || null,
        companycamProjectId: companycamProjectId || null,
        hubspotContactId: hubspotContactId || null,
      });
      if (cancelled) return;
      if (error) {
        console.warn('ProjectTimeSection quote resolve failed', error);
      }
      if (data?.id) setResolvedProjectId(data.id);
      setResolvedHsContactId(
        hubspotContactId || data?.hubspot_contact_id || null
      );
      setProjectHs({
        hubspot_quote_id: data?.hubspot_quote_id || null,
        hubspot_quote_title: data?.hubspot_quote_title || null,
        hubspot_quote_line_items: Array.isArray(data?.hubspot_quote_line_items)
          ? data.hubspot_quote_line_items
          : [],
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, companycamProjectId, hubspotContactId]);

  const quoteProgress = useMemo(
    () =>
      buildQuoteLineItemProgress(
        projectHs.hubspot_quote_line_items,
        entries
      ),
    [projectHs.hubspot_quote_line_items, entries]
  );

  const fetchEntries = useCallback(async () => {
    const novaId = resolvedProjectId || projectId || null;
    if (!novaId && !companycamProjectId) return;
    setLoading(true);
    try {
      let query = supabase
        .from('time_entries')
        .select(`
          *,
          profiles:user_id(id, full_name, email, initials),
          projects:project_id(id, name)
        `);

      if (novaId && companycamProjectId) {
        query = query.or(
          `project_id.eq.${novaId},companycam_project_id.eq.${companycamProjectId}`
        );
      } else if (companycamProjectId) {
        query = query.eq('companycam_project_id', companycamProjectId);
      } else {
        query = query.eq('project_id', novaId);
      }

      const { data, error } = await query
        .order('work_date', { ascending: false })
        .order('start_time', { ascending: false });

      if (error) throw error;
      setEntries(data || []);
    } catch (err) {
      console.error(err);
      toast({
        variant: 'destructive',
        title: t('common.error'),
        description: t('time.loadError'),
      });
    } finally {
      setLoading(false);
    }
  }, [projectId, resolvedProjectId, companycamProjectId, toast, t]);

  const fetchUsers = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email, initials')
      .order('full_name');
    setUsers(data || []);
  }, []);

  useEffect(() => {
    fetchEntries();
    fetchUsers();
  }, [fetchEntries, fetchUsers]);

  const handleDelete = async () => {
    if (!deleting?.id) return;
    setDeletingBusy(true);
    try {
      const { error } = await supabase.from('time_entries').delete().eq('id', deleting.id);
      if (error) throw error;
      toast({ title: t('common.deleted'), description: t('time.deletedDesc') });
      setDeleting(null);
      fetchEntries();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: t('common.error'),
        description: err.message || t('common.deleteFailed'),
      });
    } finally {
      setDeletingBusy(false);
    }
  };

  const total = sumHours(entries);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            {t('time.title')}
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t('time.totalProject')} <span className="font-semibold text-foreground">{formatHoursDecimal(total)} h</span>
            {entries.length > 0 && (
              <span className="text-muted-foreground"> · {t('common.entries', { count: entries.length })}</span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="rounded-xl h-10" onClick={fetchEntries}>
            <RefreshCw className="h-4 w-4 mr-2" /> {t('common.refresh')}
          </Button>
          <Button
            size="sm"
            className="rounded-xl h-10 bg-blue-600 hover:bg-blue-700"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" /> {t('time.addHours')}
          </Button>
        </div>
      </div>

      {quoteProgress.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-primary" />
            <h4 className="text-sm font-semibold">
              {t('time.quoteProgressTitle')}
            </h4>
            {projectHs.hubspot_quote_title && (
              <span className="text-xs text-muted-foreground truncate">
                — {projectHs.hubspot_quote_title}
              </span>
            )}
          </div>
          <ul className="space-y-2">
            {quoteProgress.map((li) => {
              const pct =
                li.planned > 0
                  ? Math.min(100, Math.round((li.done / li.planned) * 100))
                  : li.done > 0
                    ? 100
                    : 0;
              return (
                <li key={li.id || li.name} className="space-y-1">
                  <div className="flex items-start justify-between gap-3 text-sm">
                    <span className="font-medium truncate" title={li.name}>
                      {li.name}
                    </span>
                    <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                      {t('time.quoteProgressDone', {
                        done: li.done,
                        planned: li.planned,
                      })}
                      {' · '}
                      <span
                        className={
                          li.remaining > 0
                            ? 'text-amber-700 dark:text-amber-400 font-semibold'
                            : 'text-emerald-700 dark:text-emerald-400 font-semibold'
                        }
                      >
                        {t('time.quoteProgressRemaining', { remaining: li.remaining })}
                      </span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        li.remaining <= 0 ? 'bg-emerald-500' : 'bg-blue-500'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <TimeEntriesTable
        entries={entries}
        loading={loading}
        showUser
        showProject={false}
        emptyMessage={t('time.empty')}
        onEdit={(row) => {
          setEditing(row);
          setFormOpen(true);
        }}
        onDelete={setDeleting}
      />

      <TimeEntryFormDialog
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) setEditing(null);
        }}
        entry={editing}
        projects={
          (resolvedProjectId || projectId)
            ? [
                {
                  id: resolvedProjectId || projectId,
                  name: projectName || t('expenses.project'),
                  companycam_project_id: companycamProjectId || null,
                  hubspot_contact_id: resolvedHsContactId,
                  hubspot_quote_id: projectHs.hubspot_quote_id,
                  hubspot_quote_title: projectHs.hubspot_quote_title,
                  hubspot_quote_line_items: projectHs.hubspot_quote_line_items,
                },
              ]
            : []
        }
        users={users}
        // Keep locks keyed on the *prop* projectId so an async resolve of the
        // Novacam UUID (CC → shadow row) does not remount / reset the open form.
        defaultProjectId={projectId || null}
        lockProject={Boolean(projectId)}
        lockCompanyCam={!projectId && Boolean(companycamProjectId)}
        ccProjectId={companycamProjectId || null}
        ccProjectName={projectName || null}
        hubspotContactId={resolvedHsContactId}
        progressEntries={entries}
        onSuccess={fetchEntries}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('time.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('time.deleteDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-red-600 hover:bg-red-700"
              onClick={handleDelete}
              disabled={deletingBusy}
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ProjectTimeSection;
